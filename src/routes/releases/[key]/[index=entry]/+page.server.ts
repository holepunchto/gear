import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReleases, ReleaseError } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);

	const [key, release] = await Promise.all([
		releases.getKey(params.key),
		releases.release(params.key, Number(params.index))
	]).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});

	const previous =
		release.index > 0 ? await releases.release(key.key, release.index - 1).catch(() => null) : null;
	return { key, release, previous };
};
