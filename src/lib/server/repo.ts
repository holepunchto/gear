import { parseCommit } from 'gip-remote';
import type { GipDB } from './gip';
import { parseCommitMessage, type ParsedCommit } from './commit-parse';

/**
 * Get a Remote by name, reusing the cached instance if we've opened it before
 * this process lifetime. Returns null if the repo isn't known locally.
 */
export async function openRepo(db: GipDB, name: string) {
	let remote = db.getRemote(name);
	if (!remote) {
		remote = await db.getRepo(name);
	}
	return remote;
}

// gip-remote stores branch + per-file commit metadata in HyperDB collections
// `@gip/branches` and `@gip/files`. The Remote class doesn't expose them
// publicly yet, so these helpers reach into `_db` directly. When gip-remote
// publishes equivalents we should swap to those.

type RemoteWithDB = {
	_db: {
		get(collection: string, query: object): Promise<unknown>;
		find(collection: string, query?: object): AsyncIterable<unknown>;
	};
	getObject(oid: string): Promise<{ type: string; size: number; data: Buffer } | null>;
};

export type CommitMeta = {
	oid: string;
	author: string | null;
	message: string;
	timestamp: number;
	parents: string[];
};

export type FileMeta = {
	path: string;
	oid: string;
	mode: number;
	size: number;
	author: string | null;
	message: string;
	timestamp: number;
};

export type RefCommit = {
	author: string | null;
	message: ParsedCommit;
	timestamp: number;
};

export type RefEntry = { name: string; oid: string; commitOid: string; commit: RefCommit | null };

/**
 * Branches with the tip commit push() already denormalized onto each record —
 * author, message and time come free with the same scan that lists the names.
 */
export async function getBranchRefs(remote: unknown): Promise<RefEntry[]> {
	const r = remote as RemoteWithDB;
	const out: RefEntry[] = [];

	for await (const row of r._db.find('@gip/branches')) {
		const b = row as {
			name: string;
			commitOid: string;
			author: string | null;
			message: string;
			timestamp: number;
		};
		out.push({
			name: b.name,
			oid: b.commitOid,
			commitOid: b.commitOid,
			commit: {
				author: b.author,
				message: parseCommitMessage(b.message),
				timestamp: b.timestamp
			}
		});
	}

	return out;
}

/**
 * Tags with the commit each one points at.
 *
 * Tag records carry the *tagger* (null for lightweight tags), not the commit,
 * so every tip is read from its commit object. That's one object read per tag
 * — measured at 5-10ms for 30-odd tags against a local core, cheap enough to
 * do up front rather than lazily per row.
 */
export async function getTagRefs(remote: unknown): Promise<RefEntry[]> {
	const r = remote as RemoteWithDB;
	const rows: { name: string; oid: string; commitOid: string }[] = [];

	for await (const row of r._db.find('@gip/tags')) {
		rows.push(row as { name: string; oid: string; commitOid: string });
	}

	return Promise.all(
		rows.map(async (t) => ({
			name: t.name,
			oid: t.oid,
			commitOid: t.commitOid,
			commit: await readCommit(r, t.commitOid)
		}))
	);
}

async function readCommit(r: RemoteWithDB, oid: string): Promise<RefCommit | null> {
	const obj = await r.getObject(oid);
	if (!obj || obj.type !== 'commit') return null;

	const parsed = parseCommit(obj.data) as {
		author: string | null;
		message: string;
		timestamp: number;
	};
	return {
		author: parsed.author,
		message: parseCommitMessage(parsed.message),
		timestamp: parsed.timestamp
	};
}

/**
 * Walk the parent chain from `headOid` and return up to `limit` commits in
 * topological order (HEAD first). First-parent walk only — merges aren't
 * traversed into their second parent. That matches what GitHub's "Commits"
 * tab shows by default and keeps the cost predictable.
 */
export async function getCommitHistory(
	remote: unknown,
	headOid: string,
	limit = 200
): Promise<CommitMeta[]> {
	const r = remote as RemoteWithDB;
	const out: CommitMeta[] = [];
	let current: string | null = headOid;
	const seen = new Set<string>();
	while (current && out.length < limit && !seen.has(current)) {
		seen.add(current);
		const obj = await r.getObject(current);
		if (!obj || obj.type !== 'commit') break;
		const parsed = parseCommit(obj.data) as {
			parents: string[];
			author: string | null;
			message: string;
			timestamp: number;
		};
		out.push({
			oid: current,
			author: parsed.author,
			message: parsed.message,
			timestamp: parsed.timestamp,
			parents: parsed.parents
		});
		current = parsed.parents[0] ?? null;
	}
	return out;
}

/**
 * Count commits reachable from `headOid` by walking *all* parents (so merge
 * branches contribute their own commits). Bounded by `limit` so we don't
 * choke on huge histories — caller can show "N+" when limit hits.
 */
export async function getCommitCount(
	remote: unknown,
	headOid: string,
	limit = 1000
): Promise<{ count: number; capped: boolean }> {
	const r = remote as RemoteWithDB;
	const seen = new Set<string>();
	const stack: string[] = [headOid];
	while (stack.length && seen.size < limit) {
		const oid = stack.pop()!;
		if (seen.has(oid)) continue;
		seen.add(oid);
		const obj = await r.getObject(oid);
		if (!obj || obj.type !== 'commit') continue;
		const parsed = parseCommit(obj.data) as { parents: string[] };
		for (const p of parsed.parents) if (!seen.has(p)) stack.push(p);
	}
	return { count: seen.size, capped: stack.length > 0 };
}

/**
 * All file rows for a branch, keyed by path. Each row carries the commit
 * metadata of the *last push that touched its blob* (gip-remote upserts
 * unchanged rows on every push today, so until that's fixed every row will
 * read as HEAD — see notes in gip-remote/index.js push()).
 */
export async function getFileMeta(remote: unknown, branch: string): Promise<Map<string, FileMeta>> {
	const r = remote as RemoteWithDB;
	const out = new Map<string, FileMeta>();
	for await (const row of r._db.find('@gip/files', { branch })) {
		const f = row as FileMeta;
		out.set(f.path, f);
	}
	return out;
}

/**
 * For a tree listing (direct children at `folder`), attach the most recent
 * commit metadata that touches each entry. Files get their own row's data;
 * directories get the max-timestamp row whose path lives anywhere under
 * `dir/`.
 */
export type TreeEntryWithCommit = {
	name: string;
	path: string;
	kind: 'file' | 'dir';
	size: number;
	commit: { author: string | null; message: ParsedCommit; timestamp: number } | null;
};

export function attachCommitsToTree(
	items: { name: string; path: string; kind: 'file' | 'dir'; size: number }[],
	files: Map<string, FileMeta>,
	folder: string
): TreeEntryWithCommit[] {
	const prefix = folder === '/' ? '/' : folder + '/';

	// Pre-bucket file metadata by direct child name so we don't re-scan the
	// whole map per directory entry. For files at this level it's a direct
	// hit; for directories we fold to max-timestamp on the fly.
	const dirLatest = new Map<string, FileMeta>();
	for (const [path, meta] of files) {
		if (!path.startsWith(prefix)) continue;
		const rest = path.slice(prefix.length);
		const slashIdx = rest.indexOf('/');
		if (slashIdx === -1) continue; // direct file, handled below
		const dir = rest.slice(0, slashIdx);
		const cur = dirLatest.get(dir);
		if (!cur || meta.timestamp > cur.timestamp) dirLatest.set(dir, meta);
	}

	return items.map((item) => {
		let commit: TreeEntryWithCommit['commit'] = null;
		const m = item.kind === 'file' ? files.get(item.path) : dirLatest.get(item.name);
		if (m) {
			// Parse the message once on the server so the
			// conventional-commits-parser bundle never reaches the client.
			commit = {
				author: m.author,
				message: parseCommitMessage(m.message),
				timestamp: m.timestamp
			};
		}
		return { ...item, commit };
	});
}

/**
 * Collapse a recursive file listing into the entries visible at `folder`
 * (direct children only). Mirrors what GitHub shows in a tree view.
 *
 * Walks `drive.list(folder)` — which streams every descendant — and groups
 * entries by their first path segment after the folder prefix. Duplicates are
 * coalesced: if multiple descendants share a first segment, that segment is a
 * directory; otherwise it's a file.
 */
export async function listTree(
	drive: { list: (folder: string) => AsyncIterable<{ key: string; value: { blob: { byteLength: number } } }> },
	folder: string
) {
	const prefix = folder === '/' ? '/' : folder + '/';
	const entries = new Map<
		string,
		{ name: string; path: string; kind: 'file' | 'dir'; size: number }
	>();

	for await (const entry of drive.list(folder)) {
		if (!entry.key.startsWith(prefix)) continue;
		const rest = entry.key.slice(prefix.length);
		if (!rest) continue;

		const slashIdx = rest.indexOf('/');
		const isDir = slashIdx !== -1;
		const name = isDir ? rest.slice(0, slashIdx) : rest;
		const path = prefix + name;

		if (!entries.has(name)) {
			entries.set(name, {
				name,
				path,
				kind: isDir ? 'dir' : 'file',
				size: isDir ? 0 : entry.value.blob.byteLength
			});
		}
	}

	return [...entries.values()].sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

/**
 * Look for a README at the current folder level, return its text if present
 * and within the preview budget. Case-insensitive, matches .md, .markdown,
 * .txt, or no extension.
 */
export async function findReadme(
	drive: {
		entry: (path: string) => Promise<{ value: { blob: { byteLength: number } } } | null>;
		get: (path: string) => Promise<Buffer | null>;
	},
	items: { name: string; kind: 'file' | 'dir' }[],
	folder: string,
	maxBytes: number
) {
	const candidate = items.find(
		(i) => i.kind === 'file' && /^readme(\.md|\.markdown|\.txt)?$/i.test(i.name)
	);
	if (!candidate) return null;

	const fullPath = (folder === '/' ? '/' : folder + '/') + candidate.name;
	const entry = await drive.entry(fullPath);
	if (!entry) return null;
	if (entry.value.blob.byteLength > maxBytes) return null;

	const data = await drive.get(fullPath);
	if (!data) return null;

	return { name: candidate.name, content: data.toString('utf8') };
}
