import { fail } from '@sveltejs/kit';
import z32 from 'z32';
import b4a from 'b4a';
import ReleaseKey from './releases/index.js';
import ReleaseStore from './releases/store.js';
import type { GipDB } from './gip';
import { openRepo, getTagTarget, getTagRefs, getBranchRefs, getCommitHistory } from './repo';
import { parseCommitMessage, type ParsedCommit } from './commit-parse';
import { createTag, TagError } from './tags.js';
import { newerTags } from './newer-tags.js';
import { listPearKeys, pearDir, signWithPearKey } from './pear-keys.js';
import { events } from './events';
import { log, logError } from './log.js';

// Release keys this device owns or signs for, on top of the plain-JS module
// and the local store. Errors a user can act on are ReleaseError; anything
// else is a bug or the network and surfaces as is.

const TIMEOUT = 30_000;
const NAMESPACE = 'gear/releases/';
const NAME = /^[a-z0-9][a-z0-9._/-]{0,63}$/i;
const MAX_SIGNERS = 16;
const MAX_PASTE = 4096;
// A release key to follow: the repo's clone link with the key as ?release=.
// Older links were release+pear://<key>/<name>, still accepted.
const SHARE = 'git+pear://';
const LEGACY_SHARE = 'release+pear://';
// How many rotations a lookup follows to a repo's newest key.
const MAX_HOPS = 8;
// Record types, as in ./releases/messages.js.
const ROTATE = 1;
// Gear marks the signatures it hands out, so whoever pastes one learns the
// signer is a Gear seat. A pear CLI response comes unmarked.
const GEAR_RESPONSE = 'gear:';

// `data` rides along with the message to the form: a raw signing request
// for the pear CLI when Gear can't sign.
type ErrorData = { request?: string };

export class ReleaseError extends Error {
	data: ErrorData;

	constructor(message: string, data: ErrorData = {}) {
		super(message);
		this.data = data;
	}
}

// A ReleaseError becomes a 400 for the form action `action`; anything else
// is rethrown.
export function failure(action: string, err: unknown) {
	if (err instanceof ReleaseError) {
		return fail(400, { [action]: { ...err.data, error: err.message } });
	}
	throw err;
}

export async function attempt<T>(action: string, fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (err) {
		return failure(action, err);
	}
}

export type Release = {
	name: string;
	tag: string;
	commit: string;
	tree: string;
	repo: { key: string; length: number };
};

// `gear` says the seat is known to sign in Gear: it's this device's, or a
// Gear co-signer's signature came from it. Any other may be a pear key.
// A `pear multisig` key in ~/.pear: its name and public key.
export type PearKey = { name: string; key: string };

export type Signer = { key: string; label: string | null; me: boolean; gear: boolean };

// A rotation hands a key's release log over to `to`. `name` is what this
// device calls the new key, when it knows it.
export type Rotate = { to: string; name: string | null };

export type Pending = {
	id: string;
	proposal: string;
	request: string;
	previous: number;
	mine: boolean;
	added: number;
	release: Release | null;
	rotate: Rotate | null;
	signed: string[];
	signedByMe: boolean;
};

// Owner made the key here, signer holds a seat on it, follower only reads it.
export type Role = 'owner' | 'signer' | 'follower';

export type KeySummary = {
	key: string;
	name: string;
	owner: boolean;
	role: Role;
	// The pear key this device signs this key with, by name, or null for its
	// Gear key. Signing with it takes the key's password.
	signAs: string | null;
	// Hidden from the repo, the badges and Your releases; still seeded.
	archived: boolean;
	share: string;
	quorum: number;
	signers: Signer[];
	repo: { name: string; key: string } | null;
	length: number;
	latest: (Release & { index: number }) | null;
	// Set once a rotation is committed: the key is retired and takes no more
	// proposals. `known` says whether this device has the new key.
	rotatedTo: (Rotate & { known: boolean }) | null;
	pending: Pending[];
};

// A repo's release as every surface shows it: the latest version and what
// is pending, from this device's point of view.
export type RepoRelease = {
	key: string;
	name: string;
	role: Role;
	version: string | null;
	index: number | null;
	// The latest release's tag and the repo core and length it was cut from.
	tag: string | null;
	source: { key: string; length: number } | null;
	quorum: number;
	signers: number;
	pending: { id: string; name: string | null; missing: number; waitingOnMe: boolean } | null;
};

// What the propose form offers: the unreleased tags newer than the latest
// release, newest first, the older ones apart, and on a repo this device
// owns, the branches a new tag can name. `latest` is the latest release on
// this key or the keys it was rotated from.
export type Candidates = {
	repo: string;
	latest: { name: string; tag: string } | null;
	tags: string[];
	older: string[];
	branches: string[];
	head: string | null;
	writable: boolean;
};

export type Check = { label: string; ok: boolean; detail: string };

// The commits a release adds over the one before it, newest first, from the
// repo in the library. `status` says where the walk ended: at the previous
// release's commit, at `base` where the previous release forked off this
// history, at the cap, at the root without meeting it (history was
// rewritten), at the root of a first release, or nowhere because a commit
// isn't in this copy yet.
export type Changes = {
	repo: string;
	base: string | null;
	since: { index: number; name: string; commit: string } | null;
	commits: { oid: string; author: string | null; message: ParsedCommit; timestamp: number }[];
	more: string | null;
	status: 'reached' | 'forked' | 'capped' | 'unrelated' | 'first' | 'missing';
};

// What a rotation hands over to: the new key's signers and threshold, when
// this device can open it.
export type Successor = Rotate & { signers: Signer[] | null; quorum: number | null };

export type Inspection =
	| { ok: true; release: Release | null; rotate: Successor | null; checks: Check[] }
	| { ok: false; error: string; checks: Check[] };

type KeyRecord = {
	key: string;
	name: string;
	namespace: string;
	signers: string[];
	quorum: number;
	repo: { name: string; key: string } | null;
	owner: boolean;
	follower?: boolean;
	labels: Record<string, string>;
	// Signers whose signatures came from Gear.
	gear?: string[];
	// This device signs with this pear key instead of its Gear key.
	signAs?: PearKey;
	added: number;
	archived?: boolean;
};

type Core = {
	key: Uint8Array;
	length: number;
	has(index: number): Promise<boolean>;
	download(range: { start: number; end: number }): unknown;
	on(event: 'append', fn: () => void): void;
};

type Key = {
	core: Core;
	length: number;
	signers: string[];
	quorum: number;
	ready(): Promise<void>;
	follow(opts?: { timeout?: number }): Promise<RawEntry>;
	get(index: number): Promise<RawEntry>;
	rotatedTo(): Promise<Uint8Array | null>;
	propose(release: object): Promise<string>;
	proposeRotate(to: Uint8Array): Promise<string>;
	inspect(proposal: string): Promise<{ record: RawEntry }>;
	sign(proposal: string, keyPair: unknown): Promise<string>;
	commit(proposal: string, responses: string[]): Promise<number>;
};

type KeyOpts = {
	key?: Uint8Array | null;
	signers?: Uint8Array[];
	namespace?: string;
	quorum?: number;
	blind?: unknown;
	timeout?: number;
};

const Module = ReleaseKey as unknown as new (
	store: unknown,
	swarm: unknown,
	opts: KeyOpts
) => Key & {
	close(): Promise<void>;
};

type RawRelease = {
	type: 0;
	name: string;
	tag: string;
	commit: Uint8Array;
	tree: Uint8Array;
	repo: { key: Uint8Array; length: number };
	previous: number;
};

type RawEntry = RawRelease | { type: typeof ROTATE; previous: number; to: Uint8Array };

type Store = InstanceType<typeof ReleaseStore>;

class Releases {
	private db: GipDB;
	private store: Store;
	private keys = new Map<string, Promise<Key>>();
	// Keys a followed key rotated to that are being followed now.
	private successors = new Set<string>();
	private seat: { publicKey: Uint8Array; secretKey: Uint8Array } | null = null;

	constructor(db: GipDB) {
		this.db = db;
		this.store = new ReleaseStore(this.corestore);
	}

	private get corestore() {
		return (this.db as unknown as { _store: unknown })._store;
	}

	// gip's BlindPeering takes addCoreBackground; the module only calls addCore
	// and never awaits it.
	private get blind() {
		const blind = this.db.blind as {
			addCoreBackground(core: unknown, opts: object): void;
		} | null;
		if (!blind) return null;
		return { addCore: (core: unknown) => blind.addCoreBackground(core, { announce: true }) };
	}

	// This device's Gear key.
	get seatKey() {
		return z32.encode(this.seat!.publicKey) as string;
	}

	// The key this device signs `record` with: a pear key or its Gear key.
	private seatFor(record: KeyRecord) {
		return record.signAs?.key ?? this.seatKey;
	}

	// The pear multisig keys on this computer. None on phones.
	async pearKeys(): Promise<PearKey[]> {
		return listPearKeys(pearDir());
	}

	async open() {
		await this.store.ready();
		this.seat = await this.store.seat();
		const records = (await this.store.listKeys()) as KeyRecord[];
		for (const record of records) await this.key(record);
		log(`releases ready (${records.length} keys)`);
	}

	private key(record: KeyRecord): Promise<Key> {
		let opening = this.keys.get(record.key);
		if (opening) return opening;
		// A follower may not know the namespace, so it opens by key.
		opening = record.follower
			? this.start({ key: z32.decode(record.key) })
			: this.start({
					signers: record.signers.map((s) => z32.decode(s)),
					namespace: record.namespace,
					quorum: record.quorum
				});
		this.keys.set(record.key, opening);
		// A failed open reaches whoever awaits `opening`; this branch only skips
		// the watch.
		opening.then((rk) => this.watchRotation(record, rk)).catch(() => {});
		return opening;
	}

	// A followed key that rotates is followed to its new key too, once the new
	// key opens as a release key.
	private watchRotation(record: KeyRecord, rk: Key) {
		if (!record.follower) return;
		const check = () =>
			this.followRotation(record, rk).catch((err) => logError('following a rotated key', err));
		check();
		rk.core.on('append', check);
	}

	private async followRotation(record: KeyRecord, rk: Key) {
		const to = await rk.rotatedTo();
		if (!to) return;
		const key = z32.encode(to) as string;
		if (this.successors.has(key) || (await this.store.getKey(key))) return;

		this.successors.add(key);
		try {
			// No timeout: the new key may have no release yet, and following
			// waits for its first one.
			await this.followKey(to, record.name, 0);
			log(`followed ${record.name} to its new key ${short(key)}`);
		} finally {
			this.successors.delete(key);
		}
	}

	private async start(opts: KeyOpts) {
		const rk = new Module(this.corestore, this.db.swarm, {
			...opts,
			blind: this.blind,
			timeout: TIMEOUT
		});
		await rk.ready();

		// Release logs are tiny; keep every entry local so lists never wait.
		const key = z32.encode(rk.core.key) as string;
		rk.core.download({ start: 0, end: -1 });
		rk.core.on('append', () => events.emit('release', { key }));
		return rk;
	}

	private async record(key: string) {
		const record = (await this.store.getKey(key)) as KeyRecord | null;
		if (!record) throw new ReleaseError('Unknown release key');
		return record;
	}

	// Oldest first, so a repo's first key stays first.
	private async records() {
		const records = (await this.store.listKeys()) as KeyRecord[];
		return records.sort((a, b) => a.added - b.added);
	}

	async listKeys(): Promise<KeySummary[]> {
		return Promise.all((await this.records()).map((r) => this.summary(r)));
	}

	// The keys that aren't archived.
	async activeKeys(): Promise<KeySummary[]> {
		const records = (await this.store.activeKeys()) as KeyRecord[];
		records.sort((a, b) => a.added - b.added);
		return Promise.all(records.map((r) => this.summary(r)));
	}

	// Release state by repo key, for every repo with an active key this device
	// knows. A repo's first key wins.
	async byRepo() {
		return repoReleases(await this.activeKeys());
	}

	async getKey(key: string): Promise<KeySummary> {
		return this.summary(await this.record(key));
	}

	// Keys for a repo, archived ones too, by the repo they name or, when they
	// name none (a key followed before its repo was added), by their latest
	// release.
	async forRepo(repoKey: string): Promise<KeySummary[]> {
		const keys = await this.listKeys();
		return keys.filter((k) => (k.repo?.key ?? k.latest?.repo.key) === repoKey);
	}

	// Newest first. Entries that haven't arrived yet are left out.
	async history(key: string, limit = 50) {
		const rk = await this.key(await this.record(key));
		const out: (Release & { index: number })[] = [];
		for (let i = rk.length - 1; i >= 0 && out.length < limit; i--) {
			const entry = await this.read(rk, i);
			if (entry) out.push(entry);
		}
		return out;
	}

	// Everything a key's page shows, for the key page and the repo's Releases tab.
	async details(key: string) {
		const summary = await this.getKey(key);
		const responses = Object.fromEntries(
			await Promise.all(
				summary.pending.map(async (p) => [p.id, await this.myResponse(key, p.id)] as const)
			)
		);
		const changes = summary.latest ? await this.changes(key, summary.latest.index) : null;
		return {
			key: summary,
			history: await this.history(key),
			candidates: await this.candidates(summary),
			responses,
			// The latest release's changes in brief: the count and the first few.
			changes: changes && {
				...changes,
				count: changes.commits.length,
				commits: changes.commits.slice(0, 3)
			}
		};
	}

	async release(key: string, index: number) {
		const rk = await this.key(await this.record(key));
		if (index >= rk.length) throw new ReleaseError('No such release');
		const entry = await this.read(rk, index);
		if (entry) return entry;
		if (await this.entry(rk, index)) {
			throw new ReleaseError('This entry hands the release log over to a new key');
		}
		throw new ReleaseError('This release has not arrived yet');
	}

	// Walks first-parent history from the release's commit until it meets the
	// previous release's history, or for `cap` commits. Null when the repo
	// isn't in the library.
	async changes(key: string, index: number, cap = 100): Promise<Changes | null> {
		const record = await this.record(key);
		const rk = await this.key(record);
		const release = await this.read(rk, index);
		if (!release) return null;

		const repo = await this.libraryRepo(record, release.repo.key);
		if (!repo) return null;

		// Stop where this release's history meets the previous one's: at its
		// commit, or where it forked off when it was tagged off the line.
		const previous = index > 0 ? await this.read(rk, index - 1) : null;
		const before = previous ? await getCommitHistory(repo.remote, previous.commit, cap + 1) : [];
		const stop = new Set(before.map((c) => c.oid));

		const walked = await getCommitHistory(repo.remote, release.commit, cap + 1, stop);
		const commits = walked.slice(0, cap);
		const more = walked.length > cap ? walked[cap].oid : null;
		const met = walked.length ? walked[walked.length - 1].parents[0] : release.commit;

		let status: Changes['status'];
		if (more) status = 'capped';
		else if (!previous) status = walked.length ? 'first' : 'missing';
		else if (!stop.size) status = 'missing';
		else if (met === previous.commit) status = 'reached';
		else if (stop.has(met)) status = 'forked';
		else status = walked.length ? 'unrelated' : 'missing';

		return {
			repo: repo.name,
			base: status === 'forked' ? met : null,
			since: previous && { index: previous.index, name: previous.name, commit: previous.commit },
			commits: commits.map((c) => ({
				oid: c.oid,
				author: c.author,
				message: parseCommitMessage(c.message),
				timestamp: c.timestamp
			})),
			more,
			status
		};
	}

	// The library repo with this core key: the key's own repo when it matches,
	// otherwise a scan of the library.
	private async libraryRepo(record: KeyRecord, repoKey: string) {
		const name = record.repo?.key === repoKey ? record.repo.name : await this.findRepo(repoKey);
		if (!name) return null;
		const remote = (await openRepo(this.db, name)) as { core: { key: Uint8Array } } | null;
		if (!remote || z32.encode(remote.core.key) !== repoKey) return null;
		return { name, remote };
	}

	private async candidates(summary: KeySummary): Promise<Candidates | null> {
		if (!summary.repo) return null;
		const remote = (await openRepo(this.db, summary.repo.name)) as {
			core: { writable: boolean };
			getHead(): Promise<string | null>;
		} | null;
		if (!remote) return null;

		const { tags: released, latest } = await this.released(summary.key);
		const [tags, branches, head] = await Promise.all([
			getTagRefs(remote),
			getBranchRefs(remote),
			remote.getHead()
		]);

		const unreleased = tags
			.filter((t) => !released.has(t.name))
			.sort((a, b) => (b.commit?.timestamp ?? 0) - (a.commit?.timestamp ?? 0));
		const parent = async (oid: string) =>
			(await getCommitHistory(remote, oid, 1))[0]?.parents[0] ?? null;
		const newer = new Set<string>(
			await newerTags(
				latest,
				unreleased.map((t) => ({ name: t.name, commit: t.commitOid })),
				parent
			)
		);

		return {
			repo: summary.repo.name,
			latest: latest && { name: latest.name, tag: latest.tag },
			tags: unreleased.filter((t) => newer.has(t.name)).map((t) => t.name),
			older: unreleased.filter((t) => !newer.has(t.name)).map((t) => t.name),
			branches: branches.map((b) => b.name),
			head,
			writable: remote.core.writable
		};
	}

	// Every tag released on this key or the keys it was rotated from, with
	// where, and the latest of those releases. Release logs are tiny and kept
	// local, so this reads them all.
	private async released(key: string) {
		const tags = new Map<string, { key: string; name: string; index: number }>();
		let latest: (Release & { index: number }) | null = null;
		for (const record of await this.chain(key)) {
			const rk = await this.key(record);
			for (let i = rk.length - 1; i >= 0; i--) {
				const entry = await this.read(rk, i);
				if (!entry) continue;
				latest ??= entry;
				if (!tags.has(entry.tag))
					tags.set(entry.tag, { key: record.key, name: record.name, index: i });
			}
		}
		return { tags, latest };
	}

	// This key, then the key that rotated to it and so on back, at most
	// MAX_HOPS, among the keys this device has.
	private async chain(key: string) {
		const records = await this.records();
		const out = [await this.record(key)];
		for (let hops = 0; hops < MAX_HOPS; hops++) {
			const to = out[out.length - 1].key;
			let from: KeyRecord | null = null;
			for (const r of records) {
				if (out.some((o) => o.key === r.key)) continue;
				const next = await (await this.key(r)).rotatedTo();
				if (next && z32.encode(next) === to) {
					from = r;
					break;
				}
			}
			if (!from) break;
			out.push(from);
		}
		return out;
	}

	private async summary(record: KeyRecord): Promise<KeySummary> {
		const rk = await this.key(record);
		const last = rk.length > 0 ? await this.entry(rk, rk.length - 1) : null;
		const rotated = last?.type === ROTATE ? (z32.encode(last.to) as string) : null;
		const successor = rotated ? await this.store.getKey(rotated) : null;
		// A rotation is always the last entry, so the latest release is the one
		// before it.
		const latest = rk.length - (rotated ? 2 : 1);
		const latestRelease = latest >= 0 ? await this.read(rk, latest) : null;
		const me = this.seatFor(record);
		const proposals = await this.store.listProposals(record.key);

		const pending = await Promise.all(
			proposals
				.filter((p) => p.previous >= rk.length)
				.map(async (p) => {
					const signed = (await this.store.listResponses(record.key, p.id)).map((r) => r.signer);
					return {
						id: p.id,
						proposal: p.proposal,
						request: ReleaseKey.request(p.proposal),
						previous: p.previous,
						mine: p.mine,
						added: p.added,
						release: p.release,
						rotate: p.rotate ?? null,
						signed,
						signedByMe: signed.includes(me)
					};
				})
		);

		return {
			key: record.key,
			name: record.name,
			owner: record.owner,
			role: record.follower ? 'follower' : record.owner ? 'owner' : 'signer',
			signAs: record.signAs?.name ?? null,
			archived: record.archived ?? false,
			share: shareLink(record, latestRelease),
			quorum: record.quorum,
			signers: record.signers.map((key) => ({
				key,
				label: record.labels[key] ?? null,
				me: key === me,
				gear: key === me || (record.gear?.includes(key) ?? false)
			})),
			repo: record.repo,
			length: rk.length,
			latest: latestRelease,
			rotatedTo: rotated
				? { to: rotated, name: successor?.name ?? null, known: successor !== null }
				: null,
			pending: pending.sort((a, b) => b.added - a.added)
		};
	}

	// The entry at `index`, or null when it hasn't arrived yet.
	private async entry(rk: Key, index: number) {
		if (!(await rk.core.has(index))) return null;
		return rk.get(index);
	}

	// The release at `index`, or null when it hasn't arrived or is a rotation.
	private async read(rk: Key, index: number) {
		const entry = await this.entry(rk, index);
		if (!entry || entry.type === ROTATE) return null;
		return { index, ...view(entry) };
	}

	async createKey(opts: {
		name: string;
		repo: string;
		signers: { key: string; label: string }[];
		quorum: number;
		// A pear key to sign this key with, by name.
		signAs?: string;
	}) {
		const name = opts.name.trim();
		if (!NAME.test(name)) {
			throw new ReleaseError('Use letters, numbers, dots, dashes and slashes for the name');
		}
		if (opts.signers.length === 0) throw new ReleaseError('Add at least one signer');
		if (opts.signers.length > MAX_SIGNERS) {
			throw new ReleaseError(`A key holds at most ${MAX_SIGNERS} signers`);
		}

		const signers: string[] = [];
		const labels: Record<string, string> = {};
		for (const s of opts.signers) {
			const key = normalizeKey(s.key);
			if (!key) throw new ReleaseError(`Not a signing key: ${s.key}`);
			if (signers.includes(key)) throw new ReleaseError('Each signer can only be added once');
			signers.push(key);
			if (s.label.trim()) labels[key] = s.label.trim().slice(0, 64);
		}

		if (!Number.isInteger(opts.quorum) || opts.quorum < 1 || opts.quorum > signers.length) {
			throw new ReleaseError(`Signatures needed must be between 1 and ${signers.length}`);
		}

		const signAs = opts.signAs
			? (await this.pearKeys()).find((k) => k.name === opts.signAs)
			: undefined;
		if (opts.signAs && !signAs) throw new ReleaseError(`No pear key named ${opts.signAs}`);

		const entry = (await this.db.getCore(opts.repo, { server: false, client: false })) as {
			core: { key: Uint8Array };
		} | null;
		if (!entry) throw new ReleaseError('Pick a repo from your library');

		// Same signers, quorum and namespace make the same key.
		const namespace = NAMESPACE + name;
		const known = ((await this.store.listKeys()) as KeyRecord[]).find(
			(r) =>
				r.namespace === namespace && r.quorum === opts.quorum && r.signers.join() === signers.join()
		);
		if (known) {
			await this.store.unarchive(known.key);
			return known.key;
		}

		const opening = this.start({
			signers: signers.map((s) => z32.decode(s)),
			namespace,
			quorum: opts.quorum
		});
		const key = z32.encode((await opening).core.key) as string;
		this.keys.set(key, opening);

		const record: KeyRecord = {
			key,
			name,
			namespace,
			signers,
			quorum: opts.quorum,
			repo: { name: opts.repo, key: z32.encode(entry.core.key) },
			owner: true,
			labels,
			signAs,
			added: Date.now()
		};
		await this.store.putKey(record);
		events.emit('release', { key });
		return key;
	}

	// `password` signs the proposal when this device signs the key with a
	// pear key.
	async propose(key: string, tag: string, password?: string) {
		const record = await this.record(key);
		const rk = await this.key(record);
		if (!record.repo) throw new ReleaseError('This key has no repo to release from');

		const remote = (await openRepo(this.db, record.repo.name)) as {
			core: { key: Uint8Array; length: number };
		} | null;
		if (!remote || z32.encode(remote.core.key) !== record.repo.key) {
			throw new ReleaseError(`${record.repo.name} is no longer in your library`);
		}

		await this.canPropose(key, tag);

		const target = await getTagTarget(remote, tag);
		if (!target) throw new ReleaseError(`No tag ${tag} in ${record.repo.name}`);

		const release = {
			name: tag.replace(/^v(?=\d)/, ''),
			tag,
			commit: b4a.from(target.commit, 'hex'),
			tree: b4a.from(target.tree, 'hex'),
			repo: { key: remote.core.key, length: remote.core.length },
			artifacts: []
		};

		const proposal = await rk.propose(release);
		const { source, length } = ReleaseKey.describe(proposal);
		const id = z32.encode(source) as string;

		await this.store.putProposal({
			key,
			id,
			proposal,
			previous: length - 1,
			mine: true,
			added: Date.now(),
			release: view({ ...release, type: 0, previous: length - 1 }),
			rotate: null
		});

		await this.signOwn(record, id, password);

		events.emit('release', { key });
		return id;
	}

	// Make the tag on a repo this device owns, then propose it.
	async proposeNewTag(key: string, tag: string, target: string, password?: string) {
		const record = await this.record(key);
		if (!record.repo) throw new ReleaseError('This key has no repo to release from');
		await this.canPropose(key, tag);

		const remote = await openRepo(this.db, record.repo.name);
		if (!remote) throw new ReleaseError(`${record.repo.name} is no longer in your library`);
		try {
			await createTag(remote, tag, target);
		} catch (err) {
			if (err instanceof TagError) throw new ReleaseError(err.message);
			throw err;
		}
		return this.propose(key, tag, password);
	}

	// Signs a proposal this device just made, when it holds a seat. A Gear
	// seat signing is best effort; a pear key's wrong password is reported,
	// with the proposal kept so it can be signed from its page.
	private async signOwn(record: KeyRecord, id: string, password?: string) {
		if (!record.signers.includes(this.seatFor(record))) return;
		if (!record.signAs) {
			await this.sign(record.key, id).catch((err) => logError('signing own proposal failed', err));
			return;
		}
		if (!password) return;
		try {
			await this.sign(record.key, id, password);
		} catch (err) {
			if (!(err instanceof ReleaseError)) throw err;
			throw new ReleaseError(`Proposed, not signed yet: ${err.message}`);
		}
	}

	// Make a key with new signers, then propose handing this key's release
	// log over to it. Once that commits, this key takes no more proposals.
	async proposeRotate(
		key: string,
		opts: { name: string; signers: { key: string; label: string }[]; quorum: number }
	) {
		const record = await this.record(key);
		if (!record.repo) throw new ReleaseError('This key has no repo to release from');
		await this.canPropose(key);

		const to = await this.createKey({ ...opts, repo: record.repo.name });
		if (to === key) {
			throw new ReleaseError('That is this same key. Change the signers or how many must agree');
		}

		const rk = await this.key(record);
		const proposal = await rk.proposeRotate(z32.decode(to));
		const { source, length } = ReleaseKey.describe(proposal);
		const id = z32.encode(source) as string;

		await this.store.putProposal({
			key,
			id,
			proposal,
			previous: length - 1,
			mine: true,
			added: Date.now(),
			release: null,
			rotate: { to, name: opts.name.trim() }
		});

		await this.signOwn(record, id);

		events.emit('release', { key });
		return id;
	}

	// Refuse a proposal on a key that is followed, archived or rotated, a tag
	// that is already released, or a second proposal of ours while one is
	// still collecting.
	private async canPropose(key: string, tag?: string) {
		const record = await this.record(key);
		if (record.follower) throw new ReleaseError('You follow this key; only its signers release');
		if (record.archived) throw new ReleaseError('This key is archived; unarchive it to release');
		const rk = await this.key(record);
		if (await rk.rotatedTo()) {
			throw new ReleaseError('This key was rotated; release from the key it points to');
		}
		const open = (await this.store.listProposals(key)).find(
			(p) => p.mine && p.previous >= rk.length
		);
		if (open) {
			const what = open.rotate ? 'A rotation' : (open.release?.name ?? 'A release');
			throw new ReleaseError(`${what} is still collecting signatures`);
		}
		if (tag === undefined) return;

		const released = (await this.released(key)).tags.get(tag);
		if (!released) return;
		throw new ReleaseError(
			released.key === key
				? `${tag} is already release #${released.index}`
				: `${tag} was already released on ${released.name}`
		);
	}

	// A proposal pasted in by a co-signer. Opens the key if this device hasn't
	// seen it yet. Nothing in it is trusted until inspect() replicates it.
	async receive(text: string) {
		const proposal = text.trim();
		let described: ReturnType<typeof ReleaseKey.describe>;
		try {
			if (proposal.length > MAX_PASTE) throw new Error('too long');
			described = ReleaseKey.describe(proposal);
		} catch {
			throw new ReleaseError('That is not a release proposal');
		}

		const signers = described.signers.map((s) => z32.encode(s) as string);
		const pear = signers.includes(this.seatKey)
			? undefined
			: (await this.pearKeys()).find((k) => signers.includes(k.key));
		if (!signers.includes(this.seatKey) && !pear) {
			// It may be for a pear key of yours: hand back what the CLI signs.
			throw new ReleaseError(
				'Your Gear signing key is not one of the signers on this release key',
				{
					request: ReleaseKey.request(proposal)
				}
			);
		}

		const key = z32.encode(described.key) as string;
		const id = z32.encode(described.source) as string;

		const known = (await this.store.getKey(key)) as KeyRecord | null;
		if (known && pear && !known.signAs) await this.store.putKey({ ...known, signAs: pear });
		if (!known) {
			const record: KeyRecord = {
				key,
				name: described.namespace.startsWith(NAMESPACE)
					? described.namespace.slice(NAMESPACE.length)
					: described.namespace,
				namespace: described.namespace,
				signers,
				quorum: described.quorum,
				repo: null,
				owner: false,
				labels: {},
				signAs: pear,
				added: Date.now()
			};
			await this.store.putKey(record);
			await this.key(record);
		}

		if (!(await this.store.getProposal(key, id))) {
			await this.store.putProposal({
				key,
				id,
				proposal,
				previous: described.length - 1,
				mine: false,
				added: Date.now(),
				release: null,
				rotate: null
			});
			events.emit('release', { key });
		}

		return { key, id };
	}

	// A key pasted in to follow: a bare z32 key or a share string. Reads the
	// latest release to learn the repo and keeps the key with the follower
	// role. A key this device already has is returned as is.
	async follow(text: string) {
		const parsed = parseShare(text);
		if (!parsed) throw new ReleaseError('That is not a release key');
		return this.followKey(parsed.key, parsed.name);
	}

	// `timeout` 0 waits for the key's first entry however long it takes.
	private async followKey(keyBytes: Uint8Array, name: string | null, timeout?: number) {
		const key = z32.encode(keyBytes) as string;
		if (await this.store.getKey(key)) return key;

		const opening = this.start({ key: keyBytes });
		const rk = await opening;
		let latest: RawEntry;
		try {
			latest = await rk.follow({ timeout });
		} catch (err) {
			await rk.close();
			const message =
				(err as { code?: string }).code === 'REQUEST_TIMEOUT'
					? 'No peer is serving that release key right now'
					: 'That key is not a release key';
			throw new ReleaseError(message);
		}

		// A key that has rotated ends in the rotation; its latest release is the
		// entry before.
		const release =
			latest.type === ROTATE
				? rk.length > 1
					? ((await rk.get(rk.length - 2)) as RawRelease)
					: null
				: latest;
		const repoKey = release && (z32.encode(release.repo.key) as string);
		const repo = repoKey && (await this.findRepo(repoKey));
		const record: KeyRecord = {
			key,
			name: name ?? short(key),
			namespace: '',
			signers: rk.signers,
			quorum: rk.quorum,
			repo: repo && repoKey ? { name: repo, key: repoKey } : null,
			owner: false,
			follower: true,
			labels: {},
			added: Date.now()
		};
		await this.store.putKey(record);
		this.keys.set(key, opening);
		this.watchRotation(record, rk);
		events.emit('release', { key });
		return key;
	}

	async getProposal(key: string, id: string) {
		const p = await this.store.getProposal(key, id);
		if (!p) throw new ReleaseError('Unknown proposal');
		const signed = (await this.store.listResponses(key, id)).map((r) => r.signer);
		const me = this.seatFor(await this.record(key));
		return {
			...p,
			request: ReleaseKey.request(p.proposal),
			signed,
			signedByMe: signed.includes(me)
		};
	}

	async inspect(key: string, id: string): Promise<Inspection> {
		const record = await this.record(key);
		const rk = await this.key(record);
		const p = await this.getProposal(key, id);

		let raw: RawEntry;
		try {
			raw = (await rk.inspect(p.proposal)).record;
		} catch (err) {
			return { ok: false, error: (err as Error).message, checks: [] };
		}

		const stored = await this.store.getProposal(key, id);
		if (raw.type === ROTATE) return this.inspectRotate(key, id, stored, raw);

		const release = view(raw);
		if (stored && !stored.release) await this.store.putProposal({ ...stored, release });

		const checks: Check[] = [
			{ label: 'Appends to this release key', ok: true, detail: short(key) },
			{
				label:
					raw.previous === 0 ? 'First release on this key' : `Follows release #${raw.previous - 1}`,
				ok: true,
				detail: `entry #${raw.previous}`
			},
			{ label: 'Proposal matches its source', ok: true, detail: short(id) },
			...(await this.repoChecks(record, release))
		];

		return { ok: true, release, rotate: null, checks };
	}

	// A rotation is the key's last entry. The signer sees what it hands over
	// to: the new key's signers and threshold when this device can open it.
	private async inspectRotate(
		key: string,
		id: string,
		stored: Awaited<ReturnType<Store['getProposal']>>,
		raw: { previous: number; to: Uint8Array }
	): Promise<Inspection> {
		const to = z32.encode(raw.to) as string;
		const next = await this.successor(raw.to);
		const rotate: Successor = {
			to,
			name: next?.name ?? stored?.rotate?.name ?? null,
			signers: next?.signers ?? null,
			quorum: next?.quorum ?? null
		};
		if (stored && !stored.rotate) {
			await this.store.putProposal({ ...stored, rotate: { to, name: rotate.name } });
		}

		const checks: Check[] = [
			{ label: 'Appends to this release key', ok: true, detail: short(key) },
			{
				label: 'Last entry: no more releases on this key after it',
				ok: true,
				detail: `entry #${raw.previous}`
			},
			{ label: 'Proposal matches its source', ok: true, detail: short(id) },
			{
				label: next?.signers
					? `New key: ${next.quorum} of ${next.signers.length} must sign`
					: "New key's signers can't be seen from here yet",
				ok: Boolean(next?.signers),
				detail: short(to)
			}
		];
		return { ok: true, release: null, rotate, checks };
	}

	// The signers and threshold of a key, from this device's records or, when
	// it doesn't know the key, by opening it. A key with no entries yet can't
	// be opened by key alone.
	private async successor(to: Uint8Array) {
		const key = z32.encode(to) as string;
		const record = (await this.store.getKey(key)) as KeyRecord | null;
		const me = record ? this.seatFor(record) : this.seatKey;
		const signers = (keys: string[], labels: Record<string, string> = {}, gear: string[] = []) =>
			keys.map((s) => ({
				key: s,
				label: labels[s] ?? null,
				me: s === me,
				gear: s === me || gear.includes(s)
			}));
		if (record) {
			return {
				name: record.name,
				signers: signers(record.signers, record.labels, record.gear),
				quorum: record.quorum
			};
		}

		const rk = new Module(this.corestore, this.db.swarm, { key: to, timeout: 5000 });
		try {
			await rk.follow();
			return { name: null, signers: signers(rk.signers), quorum: rk.quorum };
		} catch {
			return null;
		} finally {
			await rk.close();
		}
	}

	private async repoChecks(record: KeyRecord, release: Release): Promise<Check[]> {
		const name = await this.findRepo(release.repo.key);
		if (!name) {
			return [
				{
					label: 'Repo is in your library',
					ok: false,
					detail: 'add it to check the commit'
				}
			];
		}

		if (!record.repo) await this.store.putKey({ ...record, repo: { name, key: release.repo.key } });

		const remote = (await openRepo(this.db, name)) as {
			core: { length: number };
			update(): Promise<void>;
		};
		await within(remote.update(), TIMEOUT);

		const target = await within(getTagTarget(remote, release.tag), TIMEOUT);
		return [
			{
				label: 'Repo has reached the proposed length',
				ok: remote.core.length >= release.repo.length,
				detail: `${name} @ ${release.repo.length}`
			},
			{
				label: `Tag ${release.tag} points at the commit`,
				ok: target?.commit === release.commit,
				detail: release.commit.slice(0, 7)
			},
			{
				label: 'Tree hash matches the commit',
				ok: target?.tree === release.tree,
				detail: release.tree.slice(0, 7)
			}
		];
	}

	private async findRepo(key: string) {
		for (const name of (await this.db.getRepoNames()) as string[]) {
			const entry = (await this.db.getCore(name, { server: false, client: false })) as {
				core: { key: Uint8Array };
			} | null;
			if (entry && z32.encode(entry.core.key) === key) return name;
		}
		return null;
	}

	// With a pear key, `password` decrypts it for this one signature.
	async sign(key: string, id: string, password?: string) {
		const record = await this.record(key);
		const rk = await this.key(record);
		const p = await this.getProposal(key, id);

		let response: string;
		try {
			response = record.signAs
				? await this.signWithPear(rk, record.signAs, p.proposal, password)
				: await rk.sign(p.proposal, this.seat);
		} catch (err) {
			if (err instanceof ReleaseError) throw err;
			throw new ReleaseError((err as Error).message);
		}

		await this.store.putResponse(key, id, { signer: this.seatFor(record), response });
		events.emit('release', { key });
		return GEAR_RESPONSE + response;
	}

	// Inspects like ReleaseKey.sign, then signs the raw request with the pear
	// key the way `pear multisig sign` does. The key file is read here and
	// nowhere else.
	private async signWithPear(rk: Key, pear: PearKey, proposal: string, password?: string) {
		if (!password) throw new ReleaseError(`Enter the password for your pear key ${pear.name}`);
		await rk.inspect(proposal);
		const request = z32.decode(ReleaseKey.request(proposal)) as Uint8Array;
		let response: string;
		try {
			response = z32.encode(await signWithPearKey(pearDir(), pear.name, request, password));
		} catch (err) {
			const message = (err as Error).message;
			if (/decryption failed/.test(message)) {
				throw new ReleaseError(`Wrong password for your pear key ${pear.name}`);
			}
			if ((err as { code?: string }).code === 'ENOENT') {
				throw new ReleaseError(`No pear key ${pear.name} on this computer`);
			}
			throw err;
		}
		ReleaseKey.verify(proposal, response);
		return response;
	}

	async addResponse(key: string, id: string, text: string) {
		const p = await this.getProposal(key, id);
		const trimmed = text.trim();
		const gear = trimmed.startsWith(GEAR_RESPONSE);
		const response = gear ? trimmed.slice(GEAR_RESPONSE.length) : trimmed;

		let signer: Uint8Array;
		try {
			if (response.length > MAX_PASTE) throw new Error('too long');
			signer = ReleaseKey.verify(p.proposal, response);
		} catch (err) {
			const message = (err as Error).message;
			throw new ReleaseError(
				/another proposal|signature is invalid|not a declared signer/.test(message)
					? message
					: 'That is not a signature response'
			);
		}

		const seat = z32.encode(signer) as string;
		await this.store.putResponse(key, id, { signer: seat, response });
		const record = await this.record(key);
		if (gear && !record.gear?.includes(seat)) {
			await this.store.putKey({ ...record, gear: [...(record.gear ?? []), seat] });
		}
		events.emit('release', { key });
	}

	// This device's signature, marked as Gear's for the proposer.
	async myResponse(key: string, id: string) {
		const responses = await this.store.listResponses(key, id);
		const me = this.seatFor(await this.record(key));
		const mine = responses.find((r) => r.signer === me);
		return mine ? GEAR_RESPONSE + mine.response : null;
	}

	// Commit waits for two full copies of the new release before it returns,
	// with no bound of its own. Past the timeout the entry is already appended
	// here and the mirrors keep catching up.
	async commit(key: string, id: string) {
		const record = await this.record(key);
		const rk = await this.key(record);
		const p = await this.getProposal(key, id);

		const responses = (await this.store.listResponses(key, id)).map((r) => r.response);
		if (responses.length < record.quorum) {
			throw new ReleaseError(`Needs ${record.quorum} signatures, has ${responses.length}`);
		}

		const committing = rk.commit(p.proposal, responses);
		committing.catch((err) => logError('release commit', err));

		let done: number | null;
		try {
			done = await within(committing, TIMEOUT * 2);
		} catch (err) {
			throw new ReleaseError((err as Error).message);
		}

		if (done === null && rk.length <= p.previous) throw new ReleaseError('Commit timed out');
		await this.store.deleteProposal(key, id);
		events.emit('release', { key });
		return { length: rk.length, mirrored: done !== null };
	}

	// Local only: the key stays open and seeded, so co-signers and followers
	// lose nothing. It just stops being where this device releases from.
	async archive(key: string) {
		await this.record(key);
		await this.store.archive(key);
		events.emit('release', { key });
	}

	async unarchive(key: string) {
		await this.record(key);
		await this.store.unarchive(key);
		events.emit('release', { key });
	}

	async withdraw(key: string, id: string) {
		await this.store.deleteProposal(key, id);
		events.emit('release', { key });
	}
}

export function repoReleases(keys: KeySummary[]) {
	const byKey = new Map(keys.map((k) => [k.key, k]));
	const out: Record<string, RepoRelease> = {};
	for (const first of keys) {
		const repo = first.repo?.key ?? first.latest?.repo.key ?? first.pending[0]?.release?.repo.key;
		if (!repo || out[repo]) continue;
		const k = newest(first, byKey);
		const p = k.pending[0];
		out[repo] = {
			key: k.key,
			name: k.name,
			role: k.role,
			version: k.latest?.name ?? null,
			index: k.latest?.index ?? null,
			tag: k.latest?.tag ?? null,
			source: k.latest?.repo ?? null,
			quorum: k.quorum,
			signers: k.signers.length,
			pending: p
				? {
						id: p.id,
						name: p.rotate
							? `Rotation to ${p.rotate.name ?? short(p.rotate.to)}`
							: (p.release?.name ?? null),
						missing: Math.max(0, k.quorum - p.signed.length),
						waitingOnMe: !p.signedByMe && k.signers.some((s) => s.me)
					}
				: null
		};
	}
	return out;
}

// Follows rotations to the newest key in `byKey`, at most MAX_HOPS.
function newest(k: KeySummary, byKey: Map<string, KeySummary>) {
	for (let hops = 0; hops < MAX_HOPS && k.rotatedTo; hops++) {
		const next = byKey.get(k.rotatedTo.to);
		if (!next) break;
		k = next;
	}
	return k;
}

function view(raw: RawRelease): Release {
	return {
		name: raw.name,
		tag: raw.tag,
		commit: b4a.toString(raw.commit, 'hex'),
		tree: b4a.toString(raw.tree, 'hex'),
		repo: { key: z32.encode(raw.repo.key), length: raw.repo.length }
	};
}

function normalizeKey(text: string) {
	try {
		const key = z32.decode(text.trim()) as Uint8Array;
		return key.byteLength === 32 ? (z32.encode(key) as string) : null;
	} catch {
		return null;
	}
}

// git+pear://0.<length>.<repo key>/<repo>?release=<key>, pinned to the
// latest release's repo length. The repo link is what clones; the git+pear
// helper only reads ?storage= and leaves ?release= alone. Without a repo to
// name yet, the plain key.
function shareLink(record: KeyRecord, latest: Release | null) {
	const repo = latest?.repo ?? (record.repo && { key: record.repo.key, length: null });
	if (!repo) return record.key;
	const name = record.repo?.name ?? record.name.split('/')[0];
	const pin = repo.length === null ? '' : `0.${repo.length}.`;
	return `${SHARE}${pin}${repo.key}/${name}?release=${record.key}`;
}

// A share link, a bare key or a legacy release+pear:// link. A share link
// names the repo, so its follower record goes by the repo's name.
function parseShare(text: string) {
	const trimmed = text.trim();
	if (trimmed.length > MAX_PASTE) return null;
	if (trimmed.startsWith(SHARE)) {
		const match = /^[^?#]*\/([^/?#]*)\?(?:[^#]*&)?release=([^&#]*)/.exec(trimmed);
		const key = match && normalizeKey(match[2]);
		if (!key) return null;
		const name = match[1];
		return { key: z32.decode(key) as Uint8Array, name: NAME.test(name) ? name : null };
	}
	const rest = trimmed.startsWith(LEGACY_SHARE) ? trimmed.slice(LEGACY_SHARE.length) : trimmed;
	const slash = rest.indexOf('/');
	const key = normalizeKey(slash === -1 ? rest : rest.slice(0, slash));
	if (!key) return null;
	const name = slash === -1 ? '' : rest.slice(slash + 1);
	return { key: z32.decode(key) as Uint8Array, name: NAME.test(name) ? name : null };
}

function short(key: string) {
	return key.slice(0, 4) + '…' + key.slice(-4);
}

// Resolves to null when `promise` takes longer than `ms`.
async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<null>((resolve) => (timer = setTimeout(resolve, ms, null)));
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

const g = globalThis as unknown as { __releases?: Promise<Releases> };

export function getReleases(db: GipDB): Promise<Releases> {
	if (!g.__releases) {
		const releases = new Releases(db);
		g.__releases = releases.open().then(() => releases);
	}
	return g.__releases;
}

export type { Releases };
