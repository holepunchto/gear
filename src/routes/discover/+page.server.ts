import type { PageServerLoad } from './$types';
import { getReleases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('releases');
	return { badges: await (await getReleases(locals.db)).byRepo() };
};
