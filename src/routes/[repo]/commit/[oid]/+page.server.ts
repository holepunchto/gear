import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { openRepo, getCommitHistory } from '$lib/server/repo';
import { parseCommitMessage } from '$lib/server/commit-parse';

export const load: PageServerLoad = async ({ params, locals }) => {
	const remote = await openRepo(locals.db, params.repo);
	if (!remote) throw error(404, 'Repository not found');

	const [commit] = await getCommitHistory(remote, params.oid, 1);
	if (!commit) throw error(404, 'Commit not found');

	return {
		commit: {
			oid: commit.oid,
			author: commit.author,
			timestamp: commit.timestamp,
			parents: commit.parents,
			message: parseCommitMessage(commit.message)
		}
	};
};
