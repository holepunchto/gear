import Id from 'hypercore-id-encoding';
import type { LayoutServerLoad } from './$types';
import { getAllSourceRepos, type SourceRepo } from '$lib/server/source';

export const load: LayoutServerLoad = async ({ locals }) => {
	const publicKey = await locals.db.getPublicKey();
	const identity = Id.encode(publicKey);

	return {
		identity,
		identityShort: identity.slice(0, 6) + '…' + identity.slice(-4),
		// The library names are cheap and awaited; the discover manifest is
		// streamed so it never blocks paint. Both feed the header search.
		repoNames: (await locals.db.getRepoNames()) as string[],
		discover: getAllSourceRepos(locals.db).then(
			(d): SourceRepo[] => d.repos,
			(): SourceRepo[] => []
		)
	};
};
