import Id from 'hypercore-id-encoding';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { openRepo, getCommitCount, getBranchRefs, getTagRefs } from '$lib/server/repo';
import type { ParsedCommit } from '$lib/server/commit-parse';
import { getPendingAdd } from '$lib/server/pending';
import { events } from '$lib/server/events';
import { getReleases } from '$lib/server/release-service';

export const load: LayoutServerLoad = async ({ params, locals, url, depends }) => {
	const name = params.repo;
	// Tag this load so the client can ask for a re-run when an 'append'
	// event tells us someone pushed new blocks.
	depends('repo:' + name);
	depends('releases');

	// Still being added: no record and no git data yet, only the core filling
	// up. The page shows that and swaps to the repo when the add lands.
	const add = getPendingAdd(name);
	if (add) {
		await events.ensureRepoAttached(locals.db, name, add.key);
		const stats = events.getRepoStats(name);
		const key = Id.encode(add.key);
		const length = stats?.length ?? 0;
		return {
			repo: {
				name,
				key,
				length,
				contiguousLength: stats?.contiguousLength ?? 0,
				held: stats?.held ?? 0,
				buckets: stats?.buckets ?? null,
				peers: stats?.peers ?? 0,
				writable: false,
				url: `git+pear://0.${length}.${key}/${name}`,
				syncing: true,
				error: add.error,
				head: null,
				ref: null,
				refCommit: null,
				commitCount: { count: 0, capped: false },
				branches: [],
				tags: [],
				release: null
			}
		};
	}

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

	// The Releases tab label and the aside card.
	const release = (await (await getReleases(locals.db)).byRepo())[key] ?? null;

	return {
		repo: {
			name,
			key,
			length,
			contiguousLength: remote.core.contiguousLength,
			held: remote.core.contiguousLength,
			buckets: null,
			peers: remote.core.peers.length,
			writable: remote.core.writable,
			url: `git+pear://0.${length}.${key}/${name}`,
			head,
			ref,
			refCommit,
			commitCount,
			branches,
			tags,
			syncing: false,
			error: null,
			release
		}
	};
};
