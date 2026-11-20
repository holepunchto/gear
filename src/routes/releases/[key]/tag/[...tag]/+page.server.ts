import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReleases } from '$lib/server/release-service';
import { signedPage } from '$lib/server/release-pages';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);

	// A release opens in its repo when that is here.
	const path = await releases.releasePath(params.key, params.tag).catch(() => null);
	if (path) throw redirect(303, path);

	return signedPage(releases, params);
};
