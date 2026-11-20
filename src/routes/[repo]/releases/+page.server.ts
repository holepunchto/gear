import type { PageServerLoad } from './$types';
import { getReleases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, parent, depends, url }) => {
	depends('releases');
	const { repo } = await parent();
	const releases = await getReleases(locals.db);
	const keys = await releases.forRepo(repo.key);
	// Retired and revoked keys go after the ones releases come from.
	const active = keys
		.filter((k) => !k.archived && k.format === 'mirror')
		.sort((a, b) => rank(a) - rank(b));
	return {
		keys: await Promise.all(active.map((k) => releases.details(k.key))),
		archived: keys.filter((k) => k.archived).length,
		created: url.searchParams.get('created')
	};
};

function rank(k: { revoked: boolean; retiredTo: string | null }) {
	return k.revoked ? 2 : k.retiredTo ? 1 : 0;
}
