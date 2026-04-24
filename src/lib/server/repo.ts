import type { GipDB } from './gip';

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
