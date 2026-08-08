import Id from 'hypercore-id-encoding';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import {
	openRepo,
	getBranchHead,
	getCommitCount,
	getBranchRefs,
	getTagRefs
} from '$lib/server/repo';
import { parseCommitMessage, type ParsedCommit } from '$lib/server/commit-parse';

export const load: LayoutServerLoad = async ({ params, locals, depends }) => {
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

	// Head commit summary + count for the repo header. Reads the
	// denormalized branch record (one round-trip) for the message/time, then
	// walks parents for the count. Capped at 1000 — beyond that we render
	// "1000+" rather than blow the load budget on huge histories.
	let headCommit: {
		oid: string;
		author: string | null;
		message: ParsedCommit;
		timestamp: number;
	} | null = null;
	let commitCount = { count: 0, capped: false };
	if (head) {
		const branchHead = await getBranchHead(remote, head);
		if (branchHead) {
			headCommit = {
				oid: branchHead.commitOid,
				author: branchHead.author,
				// Parse on the server so the conventional-commits-parser bundle
				// never reaches the client. The banner/components consume the
				// normalised ParsedCommit shape.
				message: parseCommitMessage(branchHead.message),
				timestamp: branchHead.timestamp
			};
			commitCount = await getCommitCount(remote, branchHead.commitOid, 1000);
		}
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
			headCommit,
			commitCount,
			branches,
			tags
		}
	};
};
