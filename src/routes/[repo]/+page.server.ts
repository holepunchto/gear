import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// /[repo] — bounce to the default ref, or render the empty-repo state
// from +page.svelte if nothing has been pushed yet.
export const load: PageServerLoad = async ({ params, parent }) => {
	const { repo } = await parent();
	if (repo.head) {
		throw redirect(307, `/${params.repo}/${repo.head}/`);
	}
	return { empty: true };
};

export const actions: Actions = {
	delete: async ({ params, locals }) => {
		const ok = await locals.db.deleteRemote(params.repo);
		if (!ok) return fail(404, { delete: { error: 'Repository not found' } });
		throw redirect(303, '/');
	}
};
