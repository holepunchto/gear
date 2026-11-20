import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReleases } from '$lib/server/release-service';
import { proposalPage, signedPage } from '$lib/server/release-pages';

// A release of this repo by its tag: signed, or in progress. `?key=` picks
// the release key when more than one has the tag.
export const load: PageServerLoad = async ({ locals, params, parent, depends, url }) => {
	depends('releases');
	const { repo } = await parent();
	const releases = await getReleases(locals.db);
	const pick = url.searchParams.get('key');

	const found = await releases.findRelease(repo.key, params.tag, pick);
	if (!found) throw error(404, `${params.tag} isn't released in ${repo.name}`);
	if (found.id) {
		return {
			view: 'flow' as const,
			pick,
			...(await proposalPage(releases, { key: found.key, id: found.id }, url))
		};
	}
	return {
		view: 'signed' as const,
		pick,
		...(await signedPage(releases, { key: found.key, tag: params.tag }))
	};
};
