// @ts-nocheck
import Hyperbee from 'hyperbee2';
import HyperDB from 'hyperdb';
import def from 'gip-remote/schema/hyperdb';
import { decodeBlock } from 'hyperbee2/lib/encoding.js';

// A gip repo core read as it was at a length: its tags and HEAD. A release
// core is a gip repo core too, signed, so the same reads serve both. Every
// block a read needs and doesn't have locally is fetched within `timeout`.
//
// Only some lengths can be read: a write that spans several blocks has its
// tree in the last one. Each block says how many blocks of its write follow
// it, so rootAt() moves a length up to the end of its write.

export const MAX_TAGS = 10000;
// Enough probes to bisect any core length a uint can address.
const MAX_PROBES = 64;

/**
 * @param {any} store a corestore; reads open their own session of it
 * @param {Uint8Array} key the repo core
 * @param {number} length
 * @param {(db: any) => Promise<T>} fn
 * @template T
 */
async function at(store, key, length, timeout, fn) {
	const bee = new Hyperbee(store.session(), { key, timeout, autoUpdate: false });
	const db = HyperDB.bee2(bee, def, { key, length });
	try {
		await db.ready();
		return await fn(db);
	} finally {
		await db.close();
	}
}

function tagView(t) {
	return {
		name: t.name,
		oid: t.oid,
		commit: t.commitOid,
		tree: t.treeOid,
		timestamp: t.timestamp ?? 0
	};
}

/**
 * The first length at or after `length` that ends a write.
 * @param {any} store @param {Uint8Array} key @param {number} length
 */
export async function rootAt(store, key, length, { timeout }) {
	if (length === 0) return 0;
	const core = store.get({ key });
	try {
		const block = decodeBlock(await core.get(length - 1, { timeout }), length - 1);
		return length + block.batch.end;
	} finally {
		await core.close();
	}
}

/** The tag `name` at `length`, which ends a write, or null. */
export function tagAt(store, key, length, name, { timeout }) {
	if (length === 0) return null;
	return at(store, key, length, timeout, async (db) => {
		const t = await db.get('@gip/tags', { name });
		return t ? tagView(t) : null;
	});
}

/**
 * Every tag and HEAD at `length`. More than MAX_TAGS tags is refused rather
 * than read: the bytes are a peer's, not ours.
 */
export function repoAt(store, key, length, { timeout }) {
	if (length === 0) return { head: null, tags: [] };
	return at(store, key, length, timeout, async (db) => {
		const tags = [];
		for await (const t of db.find('@gip/tags', {}, { limit: MAX_TAGS + 1 })) {
			if (tags.length === MAX_TAGS) throw new Error(`More than ${MAX_TAGS} tags`);
			tags.push(tagView(t));
		}
		const head = await db.get('@gip/head', {});
		const branch = head && (await db.get('@gip/branches', { name: head.branch }));
		return {
			head: branch ? { branch: head.branch, commit: branch.commitOid } : null,
			tags
		};
	});
}

/**
 * The first length in (`from`, `to`] that ends a write and has tag `name`,
 * the way pear-repo's updater finds it: tags only accumulate, so it bisects.
 * `from` is a length known not to have it (0 for none), `to` one that does;
 * both end writes. A probe reads the end of the write its length falls in.
 * A tag that moved in between is caught later, by comparing it at the length
 * found with the tag at `to`.
 */
export async function firstLength(store, key, name, from, to, { timeout }) {
	const opts = { timeout };
	let lo = from;
	let hi = to;
	for (let probes = 0; hi - lo > 1; probes++) {
		if (probes === MAX_PROBES) throw new Error('Bisection did not converge');
		const mid = lo + Math.floor((hi - lo) / 2);
		const root = await rootAt(store, key, mid, opts);
		if (root >= hi || (await tagAt(store, key, root, name, opts))) hi = mid;
		else lo = root;
	}
	return rootAt(store, key, hi, opts);
}

export function sameTag(a, b) {
	return a.oid === b.oid && a.commit === b.commit;
}
