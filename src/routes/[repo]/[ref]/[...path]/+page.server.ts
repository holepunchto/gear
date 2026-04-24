import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { openRepo, listTree, findReadme } from '$lib/server/repo';

/** Max bytes we'll render inline. Above this, show a "too large" placeholder. */
const FILE_PREVIEW_MAX = 1_000_000; // 1 MB
/** Max README we'll render under a tree. Smaller than a file view on purpose. */
const README_PREVIEW_MAX = 500_000;
/** Heuristic: if we see a null byte in the first N bytes, treat as binary. */
const BINARY_SNIFF_BYTES = 8000;

function isProbablyBinary(buf: Uint8Array) {
	const len = Math.min(buf.length, BINARY_SNIFF_BYTES);
	for (let i = 0; i < len; i++) {
		if (buf[i] === 0) return true;
	}
	return false;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const remote = await openRepo(locals.db, params.repo);
	if (!remote) throw error(404, 'Repository not found');

	const drive = await remote.toDrive(params.ref);
	if (!drive) throw error(404, `Ref '${params.ref}' not found`);

	const rawPath = params.path ?? '';
	const cleanPath = rawPath.replace(/^\/+|\/+$/g, '');
	const folder = cleanPath === '' ? '/' : '/' + cleanPath;

	// Resolve: is this path a file entry?
	const fullPath = folder;
	const entry = folder === '/' ? null : await drive.entry(fullPath);

	if (entry) {
		const size = entry.value.blob.byteLength;
		const parentFolder = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) || '/' : '/';
		const name = folder.slice(folder.lastIndexOf('/') + 1);

		if (size > FILE_PREVIEW_MAX) {
			return {
				kind: 'file-large' as const,
				ref: params.ref,
				path: cleanPath,
				parentFolder,
				name,
				size
			};
		}

		const buf = await drive.get(fullPath);
		if (!buf) throw error(404, 'File content unavailable');

		if (isProbablyBinary(buf)) {
			return {
				kind: 'file-binary' as const,
				ref: params.ref,
				path: cleanPath,
				parentFolder,
				name,
				size
			};
		}

		return {
			kind: 'file' as const,
			ref: params.ref,
			path: cleanPath,
			parentFolder,
			name,
			size,
			content: buf.toString('utf8')
		};
	}

	// Otherwise: render as tree (folder or repo root)
	const items = await listTree(drive, folder);
	const readme = folder === '/' ? await findReadme(drive, items, folder, README_PREVIEW_MAX) : null;

	return {
		kind: 'tree' as const,
		ref: params.ref,
		path: cleanPath,
		folder,
		items,
		readme
	};
};
