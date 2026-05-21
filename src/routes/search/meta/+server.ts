import { json } from '@sveltejs/kit';
import hid from 'hypercore-id-encoding';
import { getDB } from '$lib/server/gip';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const hex = url.searchParams.get('hex')?.trim() ?? '';
	if (!hex) return json({ name: '', description: '', repoUrl: '' });

	const db = await getDB();
	const keyBuf = Buffer.from(hex, 'hex');

	try {
		const remote = await (db as any)._createRemote({ drive: { key: keyBuf } });
		const drive = await remote.toDrive('main');
		if (!drive) return json({ name: '', description: '', repoUrl: '' });
		const pkgBuf = await drive.get('/package.json');
		if (!pkgBuf) return json({ name: '', description: '', repoUrl: '' });
		const pkg = JSON.parse(pkgBuf.toString());
		const z32 = hid.normalize(keyBuf);
		return json({
			name: pkg.name ?? '',
			description: pkg.description ?? '',
			repoUrl: `git+pear://${z32}/${pkg.name}`
		});
	} catch {
		return json({ name: '', description: '', repoUrl: '' });
	}
};
