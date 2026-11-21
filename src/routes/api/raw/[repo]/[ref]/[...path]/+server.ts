import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openRepo, openDrive } from '$lib/server/repo';

/**
 * Raw file download.
 *
 *   GET /api/raw/<repo>/<ref>/<path>
 *
 * Streams the file bytes straight from the remote core. We deliberately do not
 * try to detect a content-type — the viewer uses this as a "download raw"
 * escape hatch, and `application/octet-stream` with a filename is the safe
 * default.
 *
 * With `?inline` an image comes back as an image instead, so a README can show
 * it. An SVG is sandboxed: opened on its own it must not run script on the
 * app's origin.
 */
const IMAGES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	svg: 'image/svg+xml'
};

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const remote = await openRepo(locals.db, params.repo);
	if (!remote) throw error(404, 'Repository not found');

	const drive = await openDrive(remote, params.ref);
	if (!drive) throw error(404, `Ref '${params.ref}' not found`);

	const cleanPath = (params.path ?? '').replace(/^\/+|\/+$/g, '');
	if (!cleanPath) throw error(400, 'Missing path');
	const fullPath = '/' + cleanPath;

	const entry = await drive.entry(fullPath);
	if (!entry) throw error(404, 'File not found');

	const buf = await drive.get(fullPath);
	if (!buf) throw error(404, 'File content unavailable');

	const name = cleanPath.slice(cleanPath.lastIndexOf('/') + 1);

	const image = IMAGES[name.slice(name.lastIndexOf('.') + 1).toLowerCase()];
	if (url.searchParams.has('inline') && image) {
		return new Response(buf, {
			headers: {
				'content-type': image,
				'content-length': String(buf.length),
				'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
				'x-content-type-options': 'nosniff'
			}
		});
	}

	return new Response(buf, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-length': String(buf.length),
			'content-disposition': `attachment; filename="${name.replace(/"/g, '')}"`
		}
	});
};
