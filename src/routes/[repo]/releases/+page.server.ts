import type { PageServerLoad } from './$types';
import { getReleases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, parent, depends }) => {
	depends('releases');
	const { repo } = await parent();
	const releases = await getReleases(locals.db);
	return { keys: await releases.forRepo(repo.key) };
};
