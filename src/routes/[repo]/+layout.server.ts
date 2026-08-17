import Id from 'hypercore-id-encoding';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { openRepo, getCommitCount, getBranchRefs, getTagRefs } from '$lib/server/repo';
import type { ParsedCommit } from '$lib/server/commit-parse';

export const load: LayoutServerLoad = async ({ params, locals, url, depends }) => {
	const name = params.repo;
	// Tag this load so the client can ask for a re-run when an 'append'
	// event tells us someone pushed new blocks.
	depends('repo:' + name);
	const remote = await openRepo(locals.db, name);
	if (!remote) throw error(404, 'Repository not found');

	// Pull latest state from peers if available — safe no-op for writable cores.
	try {
		await remote.update();
	} catch {
		// non-fatal; a stale view is fine
	}

	// Branch and tag rows carry their tip commit so the lists can show what
	// was last done on each ref. Branch metadata is denormalized on the record
	// already; tags cost one object read each. Both collections are scanned
	// here anyway — getAllRefs() walked them and dropped everything but names.
	const [branches, tags, head] = await Promise.all([
		getBranchRefs(remote),
		getTagRefs(remote),
		remote.getHead()
	]);

	// The active ref scopes everything the layout shows — commit card, count,
	// and the children below. Path param on /[repo]/[ref]/..., ?ref= on
	// /[repo]/commits, HEAD otherwise.
	const refName = params.ref ?? url.searchParams.get('ref') ?? head;
	const branchEntry = branches.find((b) => b.name === refName);
	const tagEntry = branchEntry ? undefined : tags.find((t) => t.name === refName);
	const entry = branchEntry ?? tagEntry;

	const ref = refName
		? {
				name: refName,
				kind: tagEntry ? ('tag' as const) : ('branch' as const),
				isHead: refName === head
			}
		: null;

	// Tip commit summary + count for the repo header, both scoped to the
	// active ref. The tip rides on the ref rows already loaded above; the
	// count walks parents, capped at 1000 — beyond that we render "1000+"
	// rather than blow the load budget on huge histories.
	let refCommit: {
		oid: string;
		author: string | null;
		message: ParsedCommit;
		timestamp: number;
	} | null = null;
	let commitCount = { count: 0, capped: false };
	if (entry?.commit) {
		refCommit = {
			oid: entry.commitOid,
			author: entry.commit.author,
			message: entry.commit.message,
			timestamp: entry.commit.timestamp
		};
		commitCount = await getCommitCount(remote, entry.commitOid, 1000);
	}

	const key = Id.encode(remote.core.key);
	const length = remote.core.length;

	return {
		repo: {
			name,
			key,
			length,
			peers: remote.core.peers.length,
			writable: remote.core.writable,
			url: `git+pear://0.${length}.${key}/${name}`,
			head,
			ref,
			refCommit,
			commitCount,
			branches,
			tags
		}
	};
};
