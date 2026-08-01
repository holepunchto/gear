import Id from 'hypercore-id-encoding';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const repoNameRegex = /^[a-zA-Z0-9_-]+$/;

export const load: PageServerLoad = async ({ locals }) => {
	const names = await locals.db.getRepoNames();

	// getCore with server:false/client:false → pure local metadata, no swarm
	// announce here. The hooks init already set each core's state when needed.
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
				peers: entry.core.peers.length,
				writable: entry.core.writable,
				url: `git+pear://0.${entry.core.length}.${key}/${entry.name}`
			};
		});

	return { repos };
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

		try {
			const { name } = await locals.db.addRemote(url);
			throw redirect(303, `/${name}`);
		} catch (e) {
			if ((e as { status?: number }).status === 303) throw e; // re-throw redirect
			return fail(500, { add: { error: (e as Error).message } });
		}
	},

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { delete: { error: 'Name is required' } });

		const ok = await locals.db.deleteRemote(name);
		if (!ok) return fail(404, { delete: { error: 'Repository not found' } });
		return { delete: { ok: true } };
	}
};
