import { fail } from '@sveltejs/kit';
import z32 from 'z32';
import b4a from 'b4a';
import ReleaseKey from './releases/index.js';
import ReleaseStore from './releases/store.js';
import type { GipDB } from './gip';
import { openRepo, getTagTarget, getTagRefs, getBranchRefs } from './repo';
import { createTag, TagError } from './tags.js';
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

export class ReleaseError extends Error {}

// A ReleaseError becomes a 400 for the form action `action`; anything else
// is rethrown.
export function failure(action: string, err: unknown) {
	if (err instanceof ReleaseError) return fail(400, { [action]: { error: err.message } });
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

export type Signer = { key: string; label: string | null; me: boolean };

export type Pending = {
	id: string;
	proposal: string;
	request: string;
	previous: number;
	mine: boolean;
	added: number;
	release: Release | null;
	signed: string[];
	signedByMe: boolean;
};

export type KeySummary = {
	key: string;
	name: string;
	owner: boolean;
	quorum: number;
	signers: Signer[];
	repo: { name: string; key: string } | null;
	length: number;
	latest: (Release & { index: number }) | null;
	pending: Pending[];
};

// What the propose form offers: the repo's tags, newest first with released
// ones last, and on a repo this device owns, the branches a new tag can name.
export type TagOption = { name: string; released: number | null };

export type Candidates = {
	repo: string;
	tags: TagOption[];
	branches: string[];
	head: string | null;
	writable: boolean;
};

export type Check = { label: string; ok: boolean; detail: string };

export type Inspection =
	| { ok: true; release: Release; checks: Check[] }
	| { ok: false; error: string; checks: Check[] };

type KeyRecord = {
	key: string;
	name: string;
	namespace: string;
	signers: string[];
	quorum: number;
	repo: { name: string; key: string } | null;
	owner: boolean;
	labels: Record<string, string>;
	added: number;
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
	ready(): Promise<void>;
	get(index: number): Promise<RawRelease>;
	propose(release: object): Promise<string>;
	inspect(proposal: string): Promise<{ record: RawRelease }>;
	sign(proposal: string, keyPair: unknown): Promise<string>;
	commit(proposal: string, responses: string[]): Promise<number>;
};

type KeyOpts = {
	signers: Uint8Array[];
	namespace: string;
	quorum: number;
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
	name: string;
	tag: string;
	commit: Uint8Array;
	tree: Uint8Array;
	repo: { key: Uint8Array; length: number };
	previous: number;
};

type Store = InstanceType<typeof ReleaseStore>;

class Releases {
	private db: GipDB;
	private store: Store;
	private keys = new Map<string, Promise<Key>>();
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

	get seatKey() {
		return z32.encode(this.seat!.publicKey) as string;
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
		opening = this.start(record.signers, record.namespace, record.quorum);
		this.keys.set(record.key, opening);
		return opening;
	}

	private async start(signers: string[], namespace: string, quorum: number) {
		const rk = new Module(this.corestore, this.db.swarm, {
			signers: signers.map((s) => z32.decode(s)),
			namespace,
			quorum,
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

	async getKey(key: string): Promise<KeySummary> {
		return this.summary(await this.record(key));
	}

	async forRepo(repoKey: string): Promise<KeySummary[]> {
		const records = (await this.records()).filter((r) => r.repo?.key === repoKey);
		return Promise.all(records.map((r) => this.summary(r)));
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
		return {
			key: summary,
			history: await this.history(key),
			candidates: await this.candidates(summary),
			responses
		};
	}

	async release(key: string, index: number) {
		const rk = await this.key(await this.record(key));
		if (index >= rk.length) throw new ReleaseError('No such release');
		const entry = await this.read(rk, index);
		if (!entry) throw new ReleaseError('This release has not arrived yet');
		return entry;
	}

	private async candidates(summary: KeySummary): Promise<Candidates | null> {
		if (!summary.repo) return null;
		const remote = (await openRepo(this.db, summary.repo.name)) as {
			core: { writable: boolean };
			getHead(): Promise<string | null>;
		} | null;
		if (!remote) return null;

		const released = await this.released(summary.key);
		const [tags, branches, head] = await Promise.all([
			getTagRefs(remote),
			getBranchRefs(remote),
			remote.getHead()
		]);

		return {
			repo: summary.repo.name,
			tags: tags
				.sort((a, b) => (b.commit?.timestamp ?? 0) - (a.commit?.timestamp ?? 0))
				.map((t) => ({ name: t.name, released: released.get(t.name) ?? null }))
				.sort((a, b) => Number(a.released !== null) - Number(b.released !== null)),
			branches: branches.map((b) => b.name),
			head,
			writable: remote.core.writable
		};
	}

	// Tag → entry index for every release on the key. Release logs are tiny
	// and kept local, so this reads them all.
	private async released(key: string) {
		const rk = await this.key(await this.record(key));
		const out = new Map<string, number>();
		for (let i = 0; i < rk.length; i++) {
			const entry = await this.read(rk, i);
			if (entry) out.set(entry.tag, i);
		}
		return out;
	}

	private async summary(record: KeyRecord): Promise<KeySummary> {
		const rk = await this.key(record);
		const me = this.seatKey;
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
						signed,
						signedByMe: signed.includes(me)
					};
				})
		);

		return {
			key: record.key,
			name: record.name,
			owner: record.owner,
			quorum: record.quorum,
			signers: record.signers.map((key) => ({
				key,
				label: record.labels[key] ?? null,
				me: key === me
			})),
			repo: record.repo,
			length: rk.length,
			latest: rk.length > 0 ? await this.read(rk, rk.length - 1) : null,
			pending: pending.sort((a, b) => b.added - a.added)
		};
	}

	private async read(rk: Key, index: number) {
		if (!(await rk.core.has(index))) return null;
		return { index, ...view(await rk.get(index)) };
	}

	async createKey(opts: {
		name: string;
		repo: string;
		signers: { key: string; label: string }[];
		quorum: number;
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
		if (known) return known.key;

		const opening = this.start(signers, namespace, opts.quorum);
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
			added: Date.now()
		};
		await this.store.putKey(record);
		events.emit('release', { key });
		return key;
	}

	async propose(key: string, tag: string) {
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
			release: view({ ...release, previous: length - 1 })
		});

		if (record.signers.includes(this.seatKey)) {
			await this.sign(key, id).catch((err) => logError('signing own proposal failed', err));
		}

		events.emit('release', { key });
		return id;
	}

	// Make the tag on a repo this device owns, then propose it.
	async proposeNewTag(key: string, tag: string, target: string) {
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
		return this.propose(key, tag);
	}

	// Refuse a tag that is already released, or a second proposal of ours
	// while one is still collecting.
	private async canPropose(key: string, tag: string) {
		const rk = await this.key(await this.record(key));
		const open = (await this.store.listProposals(key)).find(
			(p) => p.mine && p.previous >= rk.length
		);
		if (open) {
			throw new ReleaseError(`${open.release?.name ?? 'A release'} is still collecting signatures`);
		}

		const index = (await this.released(key)).get(tag);
		if (index !== undefined) throw new ReleaseError(`${tag} is already release #${index}`);
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
		if (!signers.includes(this.seatKey)) {
			throw new ReleaseError('Your signing key is not one of the signers on this release key');
		}

		const key = z32.encode(described.key) as string;
		const id = z32.encode(described.source) as string;

		if (!(await this.store.getKey(key))) {
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
				release: null
			});
			events.emit('release', { key });
		}

		return { key, id };
	}

	async getProposal(key: string, id: string) {
		const p = await this.store.getProposal(key, id);
		if (!p) throw new ReleaseError('Unknown proposal');
		const signed = (await this.store.listResponses(key, id)).map((r) => r.signer);
		return { ...p, signed, signedByMe: signed.includes(this.seatKey) };
	}

	async inspect(key: string, id: string): Promise<Inspection> {
		const record = await this.record(key);
		const rk = await this.key(record);
		const p = await this.getProposal(key, id);

		let raw: RawRelease;
		try {
			raw = (await rk.inspect(p.proposal)).record;
		} catch (err) {
			return { ok: false, error: (err as Error).message, checks: [] };
		}

		const release = view(raw);
		const stored = await this.store.getProposal(key, id);
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

		return { ok: true, release, checks };
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

	async sign(key: string, id: string) {
		const rk = await this.key(await this.record(key));
		const p = await this.getProposal(key, id);

		let response: string;
		try {
			response = await rk.sign(p.proposal, this.seat);
		} catch (err) {
			throw new ReleaseError((err as Error).message);
		}

		await this.store.putResponse(key, id, { signer: this.seatKey, response });
		events.emit('release', { key });
		return response;
	}

	async addResponse(key: string, id: string, text: string) {
		const p = await this.getProposal(key, id);
		const response = text.trim();

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

		await this.store.putResponse(key, id, { signer: z32.encode(signer), response });
		events.emit('release', { key });
	}

	async myResponse(key: string, id: string) {
		const responses = await this.store.listResponses(key, id);
		return responses.find((r) => r.signer === this.seatKey)?.response ?? null;
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

	async withdraw(key: string, id: string) {
		await this.store.deleteProposal(key, id);
		events.emit('release', { key });
	}
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
