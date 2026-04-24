import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openRepo } from '$lib/server/repo';

/**
 * Raw file download.
 *
 *   GET /api/raw/<repo>/<ref>/<path>
 *
 * Streams the file bytes straight from the remote core. We deliberately do not
 * try to detect a content-type — the viewer uses this as a "download raw"
 * escape hatch, and `application/octet-stream` with a filename is the safe
 * default.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const remote = await openRepo(locals.db, params.repo);
	if (!remote) throw error(404, 'Repository not found');

	const drive = await remote.toDrive(params.ref);
	if (!drive) throw error(404, `Ref '${params.ref}' not found`);

	const cleanPath = (params.path ?? '').replace(/^\/+|\/+$/g, '');
	if (!cleanPath) throw error(400, 'Missing path');
	const fullPath = '/' + cleanPath;

	const entry = await drive.entry(fullPath);
	if (!entry) throw error(404, 'File not found');

	const buf = await drive.get(fullPath);
	if (!buf) throw error(404, 'File content unavailable');

	const name = cleanPath.slice(cleanPath.lastIndexOf('/') + 1);

	return new Response(buf, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-length': String(buf.length),
			'content-disposition': `attachment; filename="${name.replace(/"/g, '')}"`
		}
	});
};
