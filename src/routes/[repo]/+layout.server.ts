import Id from 'hypercore-id-encoding';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { openRepo } from '$lib/server/repo';

export const load: LayoutServerLoad = async ({ params, locals, depends }) => {
	const name = params.repo;
	// Tag this load so the client can ask for a re-run when an 'append'
	// event tells us someone pushed new blocks.
	depends('repo:' + name);
	const remote = await openRepo(locals.db, name);
	if (!remote) throw error(404, 'Repository not found');

	// Pull latest state from peers if available — safe no-op for writable cores.
	try {
		await remote.update();
	} catch {
		// non-fatal; a stale view is fine
	}

	const allRefs = await remote.getAllRefs();
	const head = await remote.getHead();

	const branches = allRefs
		.filter((r: { ref: string }) => r.ref.startsWith('refs/heads/'))
		.map((r: { ref: string; oid: string }) => ({
			name: r.ref.replace('refs/heads/', ''),
			oid: r.oid
		}));
	const tags = allRefs
		.filter((r: { ref: string }) => r.ref.startsWith('refs/tags/'))
		.map((r: { ref: string; oid: string }) => ({
			name: r.ref.replace('refs/tags/', ''),
			oid: r.oid
		}));

	const key = Id.encode(remote.core.key);
	const length = remote.core.length;

	return {
		repo: {
			name,
			key,
			length,
			peers: remote.core.peers.length,
			writable: remote.core.writable,
			url: `git+pear://0.${length}.${key}/${name}`,
			head,
			branches,
			tags
		}
	};
};
