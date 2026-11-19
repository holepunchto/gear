import Id from 'hypercore-id-encoding';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAllSourceRepos } from '$lib/server/source';
import { events } from '$lib/server/events';
import { startAdd, getPendingAdds } from '$lib/server/pending';
import { getReleases, repoReleases } from '$lib/server/release-service';

const repoNameRegex = /^[a-zA-Z0-9_-]+$/;

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('releases');
	const names = await locals.db.getRepoNames();

	// getCore with server:false/client:false → pure local metadata, no swarm
	// join and nothing to wait on. seedLibrary() in hooks.server.ts owns the
	// announce; this listing must never be what decides a repo's swarm state.
	const entries = await Promise.all(
		(names as string[]).map((name) => locals.db.getCore(name, { server: false, client: false }))
	);

	const repos = (entries as ({ name: string; core: any } | null)[])
		.filter((e): e is { name: string; core: any } => e !== null)
		.map((entry) => {
			const key = Id.encode(entry.core.key);
			return {
				name: entry.name,
				key,
				length: entry.core.length,
				contiguousLength: entry.core.contiguousLength,
				peers: entry.core.peers.length,
				writable: entry.core.writable,
				url: `git+pear://0.${entry.core.length}.${key}/${entry.name}`,
				syncing: false
			};
		});

	// Repos still being added have no record yet. List the ones in flight so
	// the library shows them filling up; a failed add only shows on its page.
	for (const add of getPendingAdds()) {
		if (add.error !== null || repos.some((r) => r.name === add.name)) continue;
		const stats = events.getRepoStats(add.name);
		const key = Id.encode(add.key);
		const length = stats?.length ?? 0;
		repos.push({
			name: add.name,
			key,
			length,
			contiguousLength: stats?.contiguousLength ?? 0,
			peers: stats?.peers ?? 0,
			writable: false,
			url: `git+pear://0.${length}.${key}/${add.name}`,
			syncing: true
		});
	}

	// The discover manifest streams in from the layout load (hyperconf: baked
	// config + OTA core) — the page filters out what's already in the library.
	// Network stats seed the hero panel; /api/events keeps them live.
	const releases = await (await getReleases(locals.db)).activeKeys();
	return {
		repos,
		stats: events.getStats(),
		blindPeersConfigured: ((await locals.db.getBlindPeers()) as string[]).length,
		releases,
		badges: repoReleases(releases)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();

		if (!name) return fail(400, { create: { error: 'Name is required' } });
		if (!repoNameRegex.test(name)) {
			return fail(400, {
				create: { error: 'Only alphanumeric, underscore and hyphen allowed' }
			});
		}

		try {
			await locals.db.createRemote(name);
		} catch (e) {
			return fail(500, { create: { error: (e as Error).message } });
		}

		throw redirect(303, `/${name}`);
	},

	add: async ({ request, locals }) => {
		const form = await request.formData();
		const url = String(form.get('url') ?? '').trim();

		if (!url || !url.startsWith('git+pear://')) {
			return fail(400, { add: { error: 'Must be a valid git+pear:// URL' } });
		}

		let name;
		try {
			name = await startAdd(locals.db, url, {});
		} catch (e) {
			return fail(400, { add: { error: (e as Error).message } });
		}

		throw redirect(303, `/${name}`);
	},

	addFromSource: async ({ request, locals }) => {
		const form = await request.formData();
		const url = String(form.get('url') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();

		if (!url || !name) {
			return fail(400, { addFromSource: { error: 'Missing fields' } });
		}

		// @todo lookup different sources
		const { blindPeers } = await getAllSourceRepos(locals.db).catch(() => ({
			blindPeers: []
		}));

		let added;
		try {
			added = await startAdd(locals.db, url, {
				blindPeerKeys: blindPeers.map((k: string) => Id.decode(k))
			});
		} catch (e) {
			return fail(400, { addFromSource: { error: (e as Error).message } });
		}

		throw redirect(303, `/${added}`);
	},

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		// A record can have an empty name (a clone of a link with no /<name>);
		// deleting it is how it goes away.
		const name = String(form.get('name') ?? '').trim();

		const ok = await locals.db.deleteRemote(name);
		if (!ok) return fail(404, { delete: { error: 'Repository not found' } });
		return { delete: { ok: true } };
	}
};
