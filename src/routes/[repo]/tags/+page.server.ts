import { error, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { openRepo } from '$lib/server/repo';
import { createTag, TagError } from '$lib/server/tags.js';

export const actions: Actions = {
	tag: async ({ params, request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const target = String(form.get('target') ?? '').trim();

		const remote = await openRepo(locals.db, params.repo);
		if (!remote) throw error(404, 'Repository not found');

		try {
			return { tag: { name, commit: await createTag(remote, name, target) } };
		} catch (err) {
			if (err instanceof TagError) return fail(400, { tag: { error: err.message } });
			throw err;
		}
	}
};
