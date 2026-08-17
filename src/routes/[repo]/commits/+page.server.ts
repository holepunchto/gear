import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { openRepo, getCommitHistory } from '$lib/server/repo';
import { parseCommitMessage } from '$lib/server/commit-parse';

/**
 * How many commits we render per page. Walking is cheap (one object read per
 * commit on a hot HyperDB), but the rendered page itself starts to drag past
 * a few hundred rows. Use a cursor (?cursor=<oid>) for older pages.
 */
const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ params, locals, url, parent }) => {
	const remote = await openRepo(locals.db, params.repo);
	if (!remote) throw error(404, 'Repository not found');

	// We rely on the layout's HEAD lookup to pick a starting branch. If the
	// caller wants a different ref's history, they can pass ?ref=<name>.
	const refOverride = url.searchParams.get('ref');
	const cursor = url.searchParams.get('cursor');

	const { repo } = await parent();
	const branch = refOverride ?? repo.head;
	if (!branch) {
		return {
			ref: null,
			commits: [],
			nextCursor: null,
			pageSize: PAGE_SIZE
		};
	}

	// Cursor takes precedence — paging from "after this commit" — otherwise
	// we start at the ref's tip, resolved from the layout's ref rows so tags
	// work the same as branches.
	let startOid: string | null = cursor;
	if (!startOid) {
		const entry = [...repo.branches, ...repo.tags].find((r: { name: string }) => r.name === branch);
		startOid = entry?.commitOid ?? null;
	}

	if (!startOid) {
		return { ref: branch, commits: [], nextCursor: null, pageSize: PAGE_SIZE };
	}

	// Pull one extra so we can detect "is there a next page" without doing a
	// second query — the extra row becomes the cursor for the next request.
	const commits = await getCommitHistory(remote, startOid, PAGE_SIZE + 1);
	const hasMore = commits.length > PAGE_SIZE;
	const page = hasMore ? commits.slice(0, PAGE_SIZE) : commits;
	const nextCursor = hasMore ? commits[PAGE_SIZE].oid : null;

	return {
		ref: branch,
		commits: page.map((c) => ({
			oid: c.oid,
			author: c.author,
			// Parse on the server so the client never ships the
			// conventional-commits-parser bundle. The component reads a
			// normalised shape (see commit-parse.ts).
			message: parseCommitMessage(c.message),
			timestamp: c.timestamp,
			parents: c.parents
		})),
		nextCursor,
		pageSize: PAGE_SIZE
	};
};
