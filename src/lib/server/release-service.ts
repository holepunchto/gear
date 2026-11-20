import { fail } from '@sveltejs/kit';
import z32 from 'z32';
import b4a from 'b4a';
import ReleaseKey from './releases/index.js';
import ReleaseStore from './releases/store.js';
import type { GipDB } from './gip';
import {
	openRepo,
	openDrive,
	getTagTarget,
	getTagRefs,
	getBranchRefs,
	getCommitHistory
} from './repo';
import { parseCommitMessage, type ParsedCommit } from './commit-parse';
import { createTag, TagError } from './tags.js';
import { newerTags, compareVersions } from './newer-tags.js';
import { namespaceFor, nameOf } from './release-names.js';
import { listPearKeys, pearDir, signWithPearKey } from './pear-keys.js';
import { events } from './events';
import { log, logError } from './log.js';

// Release keys this device owns, signs for or follows, on top of the plain-JS
// module and the local store. A release key is a multisig mirror of a repo's
// gip core: its signed releases are the tags in it. Errors a user can act on
// are ReleaseError; anything else is a bug or the network and surfaces as is.

const TIMEOUT = 30_000;
const NAME = /^[a-z0-9][a-z0-9._/-]{0,63}$/i;
const MAX_SIGNERS = 16;
const MAX_PASTE = 4096;
const MAX_PACKAGE_JSON = 256 * 1024;
const SHARE = 'git+pear://';
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

// A signed tag: what Gear calls a release.
export type Release = {
	name: string;
	tag: string;
	commit: string;
	tree: string;
	timestamp: number;
};

// A `pear multisig` key in ~/.pear: its name and public key.
export type PearKey = { name: string; key: string };

// `gear` says the seat is known to sign in Gear: it's this device's, or a
// Gear co-signer's signature came from it. Any other may be a pear key.
export type Signer = { key: string; label: string | null; me: boolean; gear: boolean };

export type Pending = {
	id: string;
	proposal: string;
	request: string;
	// The repo length it signs, and the key's length when it was proposed.
	length: number;
	base: number;
	mine: boolean;
	added: number;
	release: Release | null;
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
	// Not to be trusted, on this device: never used for releases.
	revoked: boolean;
	// Replaced by this key, and making one last release that points installed
	// copies at it before it is revoked.
	retiredTo: string | null;
	// 'old' is a key from before release keys mirrored the repo. It isn't
	// opened, only listed and archived.
	format: 'mirror' | 'old';
	share: string;
	quorum: number;
	signers: Signer[];
	repo: { name: string; key: string } | null;
	length: number;
	// The newest signed tag and how many tags are signed. `arriving` while the
	// signed repo isn't all on this device yet.
	latest: Release | null;
	released: number;
	arriving: boolean;
	pending: Pending[];
};

// A repo's release as every surface shows it: the latest version and what
// is pending, from this device's point of view. `source` is the release key
// and the length it is signed to, which is what installs pin.
export type RepoRelease = {
	key: string;
	name: string;
	role: Role;
	version: string | null;
	tag: string | null;
	source: { key: string; length: number } | null;
	quorum: number;
	signers: number;
	pending: { id: string; name: string | null; missing: number; waitingOnMe: boolean } | null;
};

// What the propose form offers: the unreleased tags newer than the latest
// release, newest first, the older ones apart, and on a repo this device
// owns, the branches a new tag can name.
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

// The commits a release adds over the signed tag before it, newest first,
// from the repo in the library. `status` says where the walk ended: at the
// previous release's commit, at `base` where the previous release forked off
// this history, at the cap, at the root without meeting it (history was
// rewritten), at the root of a first release, or nowhere because a commit
// isn't in this copy yet.
export type Changes = {
	repo: string;
	base: string | null;
	since: { name: string; tag: string; commit: string } | null;
	commits: { oid: string; author: string | null; message: ParsedCommit; timestamp: number }[];
	more: string | null;
	status: 'reached' | 'forked' | 'capped' | 'unrelated' | 'first' | 'missing';
};

export type Inspection =
	| { ok: true; release: Release | null; tags: Release[]; checks: Check[] }
	| { ok: false; error: string; checks: Check[] };

// What a repo's package.json says about installing it: whether it is a Pear
// app (`make` and `release` scripts), whether installed copies follow an
// `upgrade` link, and that link.
export type AppInfo = { pear: boolean; app: boolean; upgrade: string | null };

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
	// Set on every key made since release keys mirror the repo.
	mirror?: boolean;
	archived?: boolean;
	revoked?: boolean;
	retiredTo?: string | null;
};

type ProposalRecord = {
	key: string;
	id: string;
	proposal: string;
	length: number;
	base: number;
	mine: boolean;
	added: number;
	tag: string | null;
	release: Release | null;
};

type Core = {
	key: Uint8Array;
	length: number;
	contiguousLength: number;
	has(index: number): Promise<boolean>;
	treeHash(length: number): Promise<Uint8Array>;
	download(range: { start: number; end: number }): unknown;
	on(event: 'append', fn: () => void): void;
};

type RawTag = { name: string; oid: string; commit: string; tree: string; timestamp: number };
type SignedRepo = { head: { branch: string; commit: string } | null; tags: RawTag[] };

type Key = {
	core: Core;
	length: number;
	signers: string[];
	quorum: number;
	ready(): Promise<void>;
	follow(opts?: { timeout?: number }): Promise<SignedRepo>;
	repo(): Promise<SignedRepo>;
	propose(repoKey: Uint8Array, tag: string): Promise<string>;
	inspect(
		proposal: string,
		opts?: { tag?: string | null }
	): Promise<{ repo: Uint8Array; length: number; base: number; tags: RawTag[] }>;
	sign(proposal: string, keyPair: unknown, opts?: { tag?: string | null }): Promise<string>;
	commit(proposal: string, responses: string[]): Promise<number>;
	close(): Promise<void>;
};

type KeyOpts = {
	key?: Uint8Array | null;
	signers?: Uint8Array[];
	namespace?: string;
	quorum?: number;
	blind?: unknown;
	timeout?: number;
};

const Module = ReleaseKey as unknown as new (store: unknown, swarm: unknown, opts: KeyOpts) => Key;

type Store = InstanceType<typeof ReleaseStore>;

class Releases {
	private db: GipDB;
	private store: Store;
	private keys = new Map<string, Promise<Key>>();
	// Each key's signed tags, read once per length.
	private signed = new Map<string, { length: number; tags: Promise<Release[]> }>();
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
		for (const record of records) if (record.mirror) await this.key(record);
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
		return opening;
	}

	private async start(opts: KeyOpts) {
		const rk = new Module(this.corestore, this.db.swarm, {
			...opts,
			blind: this.blind,
			timeout: TIMEOUT
		});
		await rk.ready();

		// Keep the signed repo local, so reading it never waits and this device
		// seeds it.
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

	// The keys releases come from: not archived, not revoked, not old.
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

	// Keys for a repo, archived and revoked ones too.
	async forRepo(repoKey: string): Promise<KeySummary[]> {
		return (await this.listKeys()).filter((k) => k.repo?.key === repoKey);
	}

	// Every signed tag, newest first. Empty while the signed repo is still
	// arriving: reading it then would wait on peers.
	private async signedTags(record: KeyRecord): Promise<Release[]> {
		const rk = await this.key(record);
		if (rk.core.contiguousLength < rk.length) return [];
		const cached = this.signed.get(record.key);
		if (cached?.length === rk.length) return cached.tags;
		const tags = rk.repo().then(
			(repo) => sortReleases(repo.tags.map(view)),
			(err) => {
				this.signed.delete(record.key);
				throw err;
			}
		);
		this.signed.set(record.key, { length: rk.length, tags });
		return tags;
	}

	async history(key: string, limit = 50) {
		const record = await this.mirror(key);
		return (await this.signedTags(record)).slice(0, limit);
	}

	// Everything a key's page shows, for the key page and the repo's Releases tab.
	async details(key: string) {
		const summary = await this.getKey(key);
		if (summary.format === 'old') {
			return {
				key: summary,
				history: [],
				candidates: null,
				responses: {},
				changes: null,
				app: null
			};
		}
		const responses = Object.fromEntries(
			await Promise.all(
				summary.pending.map(async (p) => [p.id, await this.myResponse(key, p.id)] as const)
			)
		);
		const changes = summary.latest ? await this.changes(key, summary.latest.tag) : null;
		return {
			key: summary,
			history: await this.history(key),
			candidates: summary.revoked ? null : await this.candidates(summary),
			responses,
			// The latest release's changes in brief: the count and the first few.
			changes: changes && {
				...changes,
				count: changes.commits.length,
				commits: changes.commits.slice(0, 3)
			},
			app: summary.repo ? await this.app(summary.repo.name) : null
		};
	}

	// The signed tag `tag` and the ones either side of it, newest first.
	async release(key: string, tag: string) {
		const record = await this.mirror(key);
		const tags = await this.signedTags(record);
		const i = tags.findIndex((t) => t.tag === tag);
		if (i === -1) {
			const rk = await this.key(record);
			throw new ReleaseError(
				rk.core.contiguousLength < rk.length
					? 'This release has not arrived yet'
					: `${tag} is not signed on this key`
			);
		}
		return { release: tags[i], newer: tags[i - 1] ?? null, older: tags[i + 1] ?? null };
	}

	// Walks first-parent history from the release's commit until it meets the
	// signed tag before it, or for `cap` commits. Null when the repo isn't in
	// the library.
	async changes(key: string, tag: string, cap = 100): Promise<Changes | null> {
		const record = await this.mirror(key);
		const { release, older: previous } = await this.release(key, tag);
		const repo = await this.libraryRepo(record);
		if (!repo) return null;

		// Stop where this release's history meets the previous one's: at its
		// commit, or where it forked off when it was tagged off the line.
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
			since: previous && { name: previous.name, tag: previous.tag, commit: previous.commit },
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

	// The key's repo in the library, when it is still there under that key.
	private async libraryRepo(record: KeyRecord) {
		if (!record.repo) return null;
		const remote = (await openRepo(this.db, record.repo.name)) as {
			core: { key: Uint8Array; length: number; writable: boolean };
			getHead(): Promise<string | null>;
		} | null;
		if (!remote || z32.encode(remote.core.key) !== record.repo.key) return null;
		return { name: record.repo.name, remote };
	}

	private async candidates(summary: KeySummary): Promise<Candidates | null> {
		const record = await this.record(summary.key);
		const repo = await this.libraryRepo(record);
		if (!repo) return null;
		const { remote } = repo;

		const released = new Set((await this.signedTags(record)).map((t) => t.tag));
		const latest = summary.latest;
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
			repo: repo.name,
			latest: latest && { name: latest.name, tag: latest.tag },
			tags: unreleased.filter((t) => newer.has(t.name)).map((t) => t.name),
			older: unreleased.filter((t) => !newer.has(t.name)).map((t) => t.name),
			branches: branches.map((b) => b.name),
			head,
			writable: remote.core.writable
		};
	}

	// Reads package.json at the repo's HEAD. Null when there is none or it
	// isn't JSON.
	async app(repoName: string): Promise<AppInfo | null> {
		const remote = await openRepo(this.db, repoName);
		const head = remote && (await (remote as { getHead(): Promise<string | null> }).getHead());
		if (!head) return null;
		const drive = await openDrive(remote, head);
		const entry = drive && (await drive.entry('/package.json'));
		if (!entry || entry.value.blob.byteLength > MAX_PACKAGE_JSON) return null;
		let pkg: { upgrade?: unknown; scripts?: Record<string, unknown> };
		try {
			pkg = JSON.parse(b4a.toString(await drive.get('/package.json')));
		} catch {
			return null;
		}
		if (!pkg || typeof pkg !== 'object') return null;
		const pear = Boolean(pkg.scripts?.make && pkg.scripts?.release);
		const upgrade = typeof pkg.upgrade === 'string' ? pkg.upgrade : null;
		return { pear, app: pear || upgrade !== null, upgrade };
	}

	private async summary(record: KeyRecord): Promise<KeySummary> {
		const me = this.seatFor(record);
		const base = {
			key: record.key,
			name: record.name,
			owner: record.owner,
			role: (record.follower ? 'follower' : record.owner ? 'owner' : 'signer') as Role,
			signAs: record.signAs?.name ?? null,
			archived: record.archived ?? false,
			revoked: record.revoked ?? false,
			retiredTo: record.retiredTo ?? null,
			quorum: record.quorum,
			signers: record.signers.map((key) => ({
				key,
				label: record.labels[key] ?? null,
				me: key === me,
				gear: key === me || (record.gear?.includes(key) ?? false)
			})),
			repo: record.repo
		};
		if (!record.mirror) {
			return {
				...base,
				format: 'old',
				share: record.key,
				length: 0,
				latest: null,
				released: 0,
				arriving: false,
				pending: []
			};
		}

		const rk = await this.key(record);
		const tags = await this.signedTags(record).catch((err) => {
			logError(`reading the signed repo of ${short(record.key)}`, err);
			return [];
		});
		const proposals = (await this.store.listProposals(record.key)) as ProposalRecord[];

		const pending = await Promise.all(
			proposals
				.filter((p) => p.length > rk.length)
				.map(async (p) => {
					const signed = (await this.store.listResponses(record.key, p.id)).map((r) => r.signer);
					return {
						id: p.id,
						proposal: p.proposal,
						request: ReleaseKey.request(p.proposal),
						length: p.length,
						base: p.base,
						mine: p.mine,
						added: p.added,
						release: p.release,
						signed,
						signedByMe: signed.includes(me)
					};
				})
		);

		return {
			...base,
			format: 'mirror',
			share: shareLink(record),
			length: rk.length,
			latest: tags[0] ?? null,
			released: tags.length,
			arriving: rk.core.contiguousLength < rk.length,
			pending: pending.sort((a, b) => b.added - a.added)
		};
	}

	// A key in the mirror format, or a ReleaseError.
	private async mirror(key: string) {
		const record = await this.record(key);
		if (!record.mirror) throw new ReleaseError('This key is in the old release format');
		return record;
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

		// Same signers, quorum and namespace make the same key. A live one is
		// reused; an archived, revoked or old one is replaced under a new namespace.
		const same = ((await this.store.listKeys()) as KeyRecord[]).filter(
			(r) => r.quorum === opts.quorum && r.signers.join() === signers.join()
		);
		const live = same.find(
			(r) => nameOf(r.namespace) === name && r.mirror && !r.archived && !r.revoked
		);
		if (live) return live.key;
		const namespace = namespaceFor(name, new Set(same.map((r) => r.namespace)));

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
			added: Date.now(),
			mirror: true
		};
		await this.store.putKey(record);
		events.emit('release', { key });
		return key;
	}

	// Proposes signing the repo up to where `tag` first appears. `password`
	// signs the proposal when this device signs the key with a pear key.
	async propose(key: string, tag: string, password?: string) {
		const record = await this.canPropose(key, tag);
		const repo = await this.libraryRepo(record);
		if (!repo) throw new ReleaseError(`${record.repo!.name} is no longer in your library`);
		const target = await getTagTarget(repo.remote, tag);
		if (!target) throw new ReleaseError(`No tag ${tag} in ${repo.name}`);

		const rk = await this.key(record);
		const base = rk.length;
		let proposal: string;
		try {
			proposal = await rk.propose(repo.remote.core.key, tag);
		} catch (err) {
			throw new ReleaseError((err as Error).message);
		}
		const { id, length } = ReleaseKey.describe(proposal);

		const added = await getTagRefs(repo.remote).then((tags) => tags.find((t) => t.name === tag));
		await this.store.putProposal({
			key,
			id,
			proposal,
			length,
			base,
			mine: true,
			added: Date.now(),
			tag,
			release: {
				name: versionName(tag),
				tag,
				commit: target.commit,
				tree: target.tree,
				timestamp: added?.commit?.timestamp ?? 0
			}
		} satisfies ProposalRecord);

		await this.signOwn(record, id, password);

		events.emit('release', { key });
		return id;
	}

	// Make the tag on a repo this device owns, then propose it.
	async proposeNewTag(key: string, tag: string, target: string, password?: string) {
		const record = await this.canPropose(key, tag);
		const repo = await this.libraryRepo(record);
		if (!repo) throw new ReleaseError(`${record.repo!.name} is no longer in your library`);
		try {
			await createTag(repo.remote, tag, target);
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

	// Refuse a proposal on a key that is followed, archived, revoked or old,
	// without a repo, of a tag that is already signed, or a second proposal of
	// ours while one is still collecting.
	private async canPropose(key: string, tag: string) {
		const record = await this.mirror(key);
		if (record.follower) throw new ReleaseError('You follow this key; only its signers release');
		if (record.revoked) throw new ReleaseError('This key was revoked; release from its new key');
		if (record.archived) throw new ReleaseError('This key is archived; unarchive it to release');
		if (!record.repo) throw new ReleaseError('This key has no repo to release from');

		const rk = await this.key(record);
		const open = ((await this.store.listProposals(key)) as ProposalRecord[]).find(
			(p) => p.mine && p.length > rk.length
		);
		if (open) {
			throw new ReleaseError(`${open.release?.name ?? 'A release'} is still collecting signatures`);
		}
		if ((await this.signedTags(record)).some((t) => t.tag === tag)) {
			throw new ReleaseError(`${tag} is already signed on this key`);
		}
		return record;
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
				{ request: ReleaseKey.request(proposal) }
			);
		}

		const key = z32.encode(described.key) as string;
		const { id } = described;

		const known = (await this.store.getKey(key)) as KeyRecord | null;
		if (known && !known.mirror) throw new ReleaseError('This key is in the old release format');
		if (known?.revoked) throw new ReleaseError('This key was revoked on this device');
		if (known && pear && !known.signAs) await this.store.putKey({ ...known, signAs: pear });
		if (!known) {
			const repoKey = z32.encode(described.source) as string;
			const repo = await this.findRepo(repoKey);
			const record: KeyRecord = {
				key,
				name: nameOf(described.namespace),
				namespace: described.namespace,
				signers,
				quorum: described.quorum,
				repo: repo ? { name: repo, key: repoKey } : null,
				owner: false,
				labels: {},
				signAs: pear,
				added: Date.now(),
				mirror: true
			};
			await this.store.putKey(record);
			await this.key(record);
		}

		if (!(await this.store.getProposal(key, id))) {
			await this.store.putProposal({
				key,
				id,
				proposal,
				length: described.length,
				base: 0,
				mine: false,
				added: Date.now(),
				tag: null,
				release: null
			} satisfies ProposalRecord);
			events.emit('release', { key });
		}

		return { key, id };
	}

	// A key pasted in to follow: its git+pear:// link or a bare z32 key. A
	// key this device already has is returned as is.
	async follow(text: string) {
		const parsed = parseShare(text);
		if (!parsed) throw new ReleaseError('That is not a release key');
		const key = z32.encode(parsed.key) as string;
		if (await this.store.getKey(key)) return key;

		const opening = this.start({ key: parsed.key });
		const rk = await opening;
		try {
			await rk.follow();
		} catch (err) {
			await rk.close();
			const message =
				(err as { code?: string }).code === 'REQUEST_TIMEOUT'
					? 'No peer is serving that release key right now'
					: 'That key is not a release key';
			throw new ReleaseError(message);
		}

		const repo = await this.matchRepo(rk);
		const record: KeyRecord = {
			key,
			name: parsed.name ?? repo?.name ?? short(key),
			namespace: '',
			signers: rk.signers,
			quorum: rk.quorum,
			repo,
			owner: false,
			follower: true,
			labels: {},
			added: Date.now(),
			mirror: true
		};
		await this.store.putKey(record);
		this.keys.set(key, opening);
		events.emit('release', { key });
		return key;
	}

	// The library repo a release key mirrors: the one whose tree at the key's
	// length is the key's. Only repos that are long enough and hold that block
	// are compared.
	private async matchRepo(rk: Key) {
		const length = rk.length;
		if (length === 0) return null;
		const signed = await within(rk.core.treeHash(length), TIMEOUT);
		if (!signed) return null;
		for (const name of (await this.db.getRepoNames()) as string[]) {
			const entry = (await this.db.getCore(name, { server: false, client: false })) as {
				core: Core;
			} | null;
			if (!entry || entry.core.length < length || !(await entry.core.has(length - 1))) continue;
			if (b4a.equals(await entry.core.treeHash(length), signed)) {
				return { name, key: z32.encode(entry.core.key) as string };
			}
		}
		return null;
	}

	async getProposal(key: string, id: string) {
		const p = (await this.store.getProposal(key, id)) as ProposalRecord | null;
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
		const record = await this.mirror(key);
		const rk = await this.key(record);
		const p = await this.getProposal(key, id);
		if (record.revoked) {
			return { ok: false, error: 'This key was revoked on this device', checks: [] };
		}

		let inspected: Awaited<ReturnType<Key['inspect']>>;
		try {
			inspected = await rk.inspect(p.proposal, { tag: p.tag });
		} catch (err) {
			return { ok: false, error: (err as Error).message, checks: [] };
		}

		const tags = sortReleases(inspected.tags.map(view));
		const release = (p.tag ? tags.find((t) => t.tag === p.tag) : tags[0]) ?? null;
		const stored = (await this.store.getProposal(key, id)) as ProposalRecord | null;
		if (stored && !stored.release) {
			await this.store.putProposal({
				...stored,
				base: inspected.base,
				tag: release?.tag ?? null,
				release
			});
		}

		const repoKey = z32.encode(inspected.repo) as string;
		if (!record.repo) {
			const name = await this.findRepo(repoKey);
			if (name) await this.store.putKey({ ...record, repo: { name, key: repoKey } });
		}

		const others = tags.filter((t) => t !== release).map((t) => t.tag);
		const checks: Check[] = [
			{ label: 'Signs this release key', ok: true, detail: short(key) },
			{
				label: `The repo at length ${inspected.length} matches the request`,
				ok: true,
				detail: short(repoKey)
			},
			{
				label:
					inspected.base === 0
						? 'First release on this key'
						: `Extends the ${inspected.base} blocks already signed`,
				ok: true,
				detail: `${inspected.base} → ${inspected.length}`
			}
		];
		if (release) {
			checks.push({
				label: `Tag ${release.tag} is in the repo there`,
				ok: true,
				detail: release.commit.slice(0, 7)
			});
		}
		if (others.length) {
			checks.push({
				label: `Also signs ${others.join(', ')}`,
				ok: true,
				detail: `${others.length} more ${others.length === 1 ? 'tag' : 'tags'}`
			});
		}

		return { ok: true, release, tags, checks };
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
		const record = await this.mirror(key);
		if (record.revoked) throw new ReleaseError('This key was revoked on this device');
		const rk = await this.key(record);
		const p = await this.getProposal(key, id);

		let response: string;
		try {
			response = record.signAs
				? await this.signWithPear(rk, record.signAs, p, password)
				: await rk.sign(p.proposal, this.seat, { tag: p.tag });
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
	private async signWithPear(
		rk: Key,
		pear: PearKey,
		p: { proposal: string; tag: string | null },
		password?: string
	) {
		if (!password) throw new ReleaseError(`Enter the password for your pear key ${pear.name}`);
		await rk.inspect(p.proposal, { tag: p.tag });
		const request = z32.decode(ReleaseKey.request(p.proposal)) as Uint8Array;
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
		ReleaseKey.verify(p.proposal, response);
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
	// with no bound of its own. Past the timeout the blocks are already
	// appended here and the mirrors keep catching up.
	async commit(key: string, id: string) {
		const record = await this.mirror(key);
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

		if (done === null && rk.length < p.length) throw new ReleaseError('Commit timed out');
		await this.store.deleteProposal(key, id);
		events.emit('release', { key });
		return { length: rk.length, mirrored: done !== null };
	}

	// Rotating replaces a key that can't be trusted any more: a new, empty key
	// with the signers picked, whose first release is a normal proposal. The
	// old key is revoked on this device, unless it isn't compromised and the
	// repo is an app: then it is retired, and can make one last release whose
	// package.json `upgrade` points installed copies at the new key.
	async rotate(
		key: string,
		opts: {
			name: string;
			signers: { key: string; label: string }[];
			quorum: number;
			compromised: boolean;
		}
	) {
		const record = await this.mirror(key);
		if (record.follower) throw new ReleaseError('You follow this key; only its signers rotate it');
		if (!record.repo) throw new ReleaseError('This key has no repo to release from');

		const to = await this.createKey({
			name: opts.name,
			signers: opts.signers,
			quorum: opts.quorum,
			repo: record.repo.name,
			signAs: record.signAs?.name
		});
		if (to === key) {
			throw new ReleaseError('That is this same key. Change the signers or how many must agree');
		}
		if (!opts.compromised && (await this.app(record.repo.name))?.app) {
			await this.store.retire(key, to);
			events.emit('release', { key });
		} else {
			await this.revoke(key);
		}
		return to;
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

	// Local and one-way: this device stops trusting the key.
	async revoke(key: string) {
		await this.record(key);
		await this.store.revoke(key);
		events.emit('release', { key });
	}

	async withdraw(key: string, id: string) {
		await this.store.deleteProposal(key, id);
		events.emit('release', { key });
	}
}

export function repoReleases(keys: KeySummary[]) {
	const out: Record<string, RepoRelease> = {};
	for (const k of keys) {
		if (k.format !== 'mirror' || k.revoked || k.archived || k.retiredTo) continue;
		const repo = k.repo?.key;
		if (!repo || out[repo]) continue;
		const p = k.pending[0];
		out[repo] = {
			key: k.key,
			name: k.name,
			role: k.role,
			version: k.latest?.name ?? null,
			tag: k.latest?.tag ?? null,
			source: k.latest ? { key: k.key, length: k.length } : null,
			quorum: k.quorum,
			signers: k.signers.length,
			pending: p
				? {
						id: p.id,
						name: p.release?.name ?? null,
						missing: Math.max(0, k.quorum - p.signed.length),
						waitingOnMe: !p.signedByMe && k.signers.some((s) => s.me)
					}
				: null
		};
	}
	return out;
}

// Newest first: by semver, then tag time, then name.
function sortReleases(releases: Release[]) {
	return releases.sort(
		(a, b) =>
			compareVersions(b.tag, a.tag) ||
			b.timestamp - a.timestamp ||
			(a.tag < b.tag ? 1 : a.tag > b.tag ? -1 : 0)
	);
}

function view(t: RawTag): Release {
	return {
		name: versionName(t.name),
		tag: t.name,
		commit: t.commit,
		tree: t.tree,
		timestamp: t.timestamp
	};
}

function versionName(tag: string) {
	return tag.replace(/^v(?=\d)/, '');
}

function normalizeKey(text: string) {
	try {
		const key = z32.decode(text.trim()) as Uint8Array;
		return key.byteLength === 32 ? (z32.encode(key) as string) : null;
	} catch {
		return null;
	}
}

// git+pear://<release key>/<repo>: it clones the repo as signed.
function shareLink(record: KeyRecord) {
	const name = record.repo?.name ?? record.name.split('/')[0];
	return `${SHARE}${record.key}/${name}`;
}

// A git+pear:// link, pinned or not, or a bare key. A link names the repo,
// so its follower record goes by the repo's name.
function parseShare(text: string) {
	const trimmed = text.trim();
	if (trimmed.length > MAX_PASTE) return null;
	if (trimmed.startsWith(SHARE)) {
		const match = /^git\+pear:\/\/(?:\d+\.\d+\.)?([^/?#]+)(?:\/([^/?#]*))?/.exec(trimmed);
		const key = match && normalizeKey(match[1]);
		if (!key) return null;
		const name = match[2] ?? '';
		return { key: z32.decode(key) as Uint8Array, name: NAME.test(name) ? name : null };
	}
	const key = normalizeKey(trimmed);
	return key ? { key: z32.decode(key) as Uint8Array, name: null } : null;
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
