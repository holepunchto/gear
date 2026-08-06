import { EventEmitter } from 'node:events';
import b4a from 'b4a';
import type { GipDB } from './gip';
import { log } from './log.js';

// A single server-side event hub for live stats. Wires to swarm + per-core
// events ONCE at boot (or first attach) and lets every SSE client subscribe
// to the resulting derived state. This avoids the N×M-poll explosion you
// get if every client opens its own setInterval — instead, updates fan out
// from real underlying events with effectively zero idle CPU.
//
// Topology:
//   - swarm.on('connection')  → maintains global `peerKeys` (deduped by
//                               remotePublicKey hex). Fires 'stats'.
//   - swarm.dht.nodes.length  → polled lazily inside getStats() (changes
//                               infrequently, no event, fine to read on read).
//   - per core (lazy attach)  → 'append', 'peer-add', 'peer-remove' on the
//                               first SSE subscription for that repo.
//                               Fires 'repo:<name>' (and 'append:<name>'
//                               with deltas).
//
// Multiple SSE clients for the same topic share the same listener registration
// — no duplication.

type CoreLike = {
	length: number;
	peers: Array<{ remotePublicKey: Uint8Array }>;
	on(event: string, listener: () => void): void;
	off(event: string, listener: () => void): void;
};

type SwarmLike = {
	on(event: string, listener: (conn: ConnLike) => void): void;
	off?(event: string, listener: (conn: ConnLike) => void): void;
	dht?: { nodes?: { length: number } };
};

type ConnLike = {
	remotePublicKey: Uint8Array;
	on(event: string, listener: () => void): void;
};

type BlindPeerLike = { connected: boolean };
type BlindPeeringLike = { blindPeers: Map<unknown, BlindPeerLike> };

export type GlobalStats = {
	// Total live peers — swarm connections + connected blind peers. Blind
	// peers connect directly via dht.connect() and never fire the swarm's
	// 'connection' event, so we count them separately and sum here.
	peers: number;
	swarmPeers: number;
	blindPeers: number;
	dhtNodes: number;
};

export type RepoStats = {
	length: number;
	peers: number;
};

class EventHub extends EventEmitter {
	private peerKeys = new Set<string>();
	// Tracks attached cores so we never double-wire. WeakSet so a removed
	// remote's core can be GC'd along with its listener references.
	private attachedCores = new WeakSet<object>();
	// Track *which* repos we've attached, by name, so we can compute
	// repo stats lazily and avoid re-walking db.remotes on every read.
	private repoState = new Map<string, RepoStats>();
	private db: GipDB | null = null;
	private swarm: SwarmLike | null = null;
	private blind: BlindPeeringLike | null = null;
	// Cached count of connected blind peers — recomputed on a low-frequency
	// poll because blind-peering doesn't emit per-peer connect events. The
	// poll is one timer per process (not per SSE client) and only fires
	// 'stats' when the count actually changes.
	private blindPeerCount = 0;
	private blindPoll: ReturnType<typeof setInterval> | null = null;

	constructor() {
		super();
		// Each SSE client adds a listener; default cap of 10 would pop a
		// MaxListenersExceededWarning past the first handful. Unbounded is
		// fine here — listeners are per-connection and bounded by client count.
		this.setMaxListeners(0);
	}

	/**
	 * Attach to the db's swarm. Idempotent — safe to call repeatedly; the
	 * first call wires the listener, subsequent calls are no-ops.
	 */
	attach(db: GipDB) {
		if (this.db) return;
		this.db = db;

		// `swarm` is a getter on GipLocalDB. Cast through unknown because the
		// JS package isn't typed.
		const swarm = (db as unknown as { swarm?: SwarmLike }).swarm ?? null;
		if (!swarm) return;
		this.swarm = swarm;

		swarm.on('connection', (conn) => {
			const key = b4a.toString(conn.remotePublicKey, 'hex');
			this.peerKeys.add(key);
			log(`peer connected ${key.slice(0, 8)} (${this.peerKeys.size} swarm peers)`);
			// Swarm connection arriving is a strong hint blind peers may
			// have just connected too (network came up, etc.) — recount
			// opportunistically so the UI doesn't have to wait for the
			// next poll tick.
			this.recountBlindPeers();
			this.emit('stats');
			conn.on('close', () => {
				this.peerKeys.delete(key);
				log(`peer disconnected ${key.slice(0, 8)} (${this.peerKeys.size} swarm peers)`);
				this.recountBlindPeers();
				this.emit('stats');
			});
		});

		// Blind peers don't ride the swarm — they connect via dht.connect()
		// directly and the BlindPeer class doesn't emit lifecycle events.
		// Poll the count at a low cadence (one timer per process, fanned
		// out via 'stats' to all SSE clients) and only emit when it changed.
		//
		// Fall back to `_blind` for published gip-transport versions that
		// don't yet expose a `get blind()` getter — the field is always
		// there, the getter is just sugar over it.
		const dbAny = db as unknown as { blind?: BlindPeeringLike; _blind?: BlindPeeringLike };
		this.blind = dbAny.blind ?? dbAny._blind ?? null;
		if (this.blind) {
			this.recountBlindPeers();
			this.blindPoll = setInterval(() => {
				if (this.recountBlindPeers()) this.emit('stats');
			}, 2000);
		}
	}

	private recountBlindPeers(): boolean {
		if (!this.blind) return false;
		let n = 0;
		for (const bp of this.blind.blindPeers.values()) {
			if (bp.connected) n++;
		}
		if (n === this.blindPeerCount) return false;
		this.blindPeerCount = n;
		return true;
	}

	/**
	 * Synchronous global stats snapshot. Cheap — reads two sizes/lengths.
	 */
	getStats(): GlobalStats {
		const swarmPeers = this.peerKeys.size;
		const blindPeers = this.blindPeerCount;
		return {
			peers: swarmPeers + blindPeers,
			swarmPeers,
			blindPeers,
			dhtNodes: this.swarm?.dht?.nodes?.length ?? 0
		};
	}

	/**
	 * Attach every known repo. Used by the global stats stream so the home
	 * page can live-update its list (block counts, peer counts) without
	 * opening one SSE connection per row.
	 */
	async attachAll(db: GipDB) {
		const names: string[] = await db.getRepoNames();
		await Promise.all(names.map((name) => this.ensureRepoAttached(db, name)));
	}

	/**
	 * Wire per-core listeners for a repo on first request. We only do this
	 * when an SSE client actually cares about a given repo, so 100 stored
	 * repos don't mean 100 idle listener sets.
	 */
	async ensureRepoAttached(db: GipDB, name: string) {
		if (this.repoState.has(name)) return;

		// getCore with no swarm intent — we just want a handle. The core was
		// already joined when the repo was first opened/created elsewhere;
		// here we just need its events.
		const entry = await db.getCore(name, { server: false, client: false });
		if (!entry) return;

		const core = entry.core as CoreLike;

		// Seed initial state.
		this.repoState.set(name, {
			length: core.length,
			peers: core.peers.length
		});

		if (this.attachedCores.has(core as unknown as object)) return;
		this.attachedCores.add(core as unknown as object);

		const recompute = () => {
			this.repoState.set(name, {
				length: core.length,
				peers: core.peers.length
			});
			// Specific event for per-repo SSE handlers; generic 'repo' event
			// for aggregate listeners (e.g. the home page that wants any
			// change across the whole list). Payload includes the name so
			// generic subscribers don't need to track which repos exist.
			this.emit(`repo:${name}`);
			this.emit('repo', { name, ...(this.repoState.get(name) as RepoStats) });
		};

		// 'append' is the most interesting signal — it means new blocks just
		// landed (someone pushed). We emit a dedicated 'append:<name>' so
		// the UI can flash, plus a generic 'repo:<name>' update.
		let lastLength = core.length;
		core.on('append', () => {
			const from = lastLength;
			lastLength = core.length;
			log(`${name}: +${lastLength - from} blocks (length ${lastLength})`);
			this.emit(`append:${name}`, { from, to: lastLength, added: lastLength - from });
			recompute();
		});

		// peer-add / peer-remove fire when replication peers join or leave
		// this specific core's protocol session.
		core.on('peer-add', recompute);
		core.on('peer-remove', recompute);
	}

	/**
	 * Synchronous per-repo stats. Returns null if the repo hasn't been
	 * attached yet (caller should `await ensureRepoAttached` first).
	 */
	getRepoStats(name: string): RepoStats | null {
		return this.repoState.get(name) ?? null;
	}
}

// Singleton — one hub per server process. SvelteKit gives us a long-lived
// Node process so this just lives on globalThis like the db.
const g = globalThis as unknown as { __eventHub?: EventHub };
export const events: EventHub = g.__eventHub ?? (g.__eventHub = new EventHub());
