import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReleases, ReleaseError } from '$lib/server/release-service';

const CHANGES_CAP = 100;

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);
	const index = Number(params.index);

	const [key, release] = await Promise.all([
		releases.getKey(params.key),
		releases.release(params.key, index)
	]).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});

	const [previous, next, changes] = await Promise.all([
		index > 0 ? releases.release(key.key, index - 1).catch(() => null) : null,
		index + 1 < key.length ? releases.release(key.key, index + 1).catch(() => null) : null,
		releases.changes(key.key, index, CHANGES_CAP)
	]);

	// Where the release's repo lives: the library copy when there is one,
	// otherwise the name the key knows it by, or the key's first segment.
	const name = changes?.repo ?? key.repo?.name ?? key.name.split('/')[0];
	const url = `git+pear://0.${release.repo.length}.${release.repo.key}/${name}`;

	return { key, release, previous, next, changes, name, url };
};
