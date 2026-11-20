import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReleases, ReleaseError } from '$lib/server/release-service';

const CHANGES_CAP = 100;

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);

	const [key, { release, newer, older }] = await Promise.all([
		releases.getKey(params.key),
		releases.release(params.key, params.tag)
	]).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});

	const changes = await releases.changes(key.key, release.tag, CHANGES_CAP);
	const app = key.repo ? await releases.app(key.repo.name) : null;

	// The repo's name: the library copy when there is one, otherwise the name
	// the key knows it by, or the key's first segment. The link clones the
	// release key, pinned to its signed length.
	const name = changes?.repo ?? key.repo?.name ?? key.name.split('/')[0];
	const url = `git+pear://0.${key.length}.${key.key}/${name}`;

	return {
		key,
		release,
		previous: older,
		next: newer,
		changes,
		name,
		url,
		pear: app?.pear ?? false
	};
};
