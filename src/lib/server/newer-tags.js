// @ts-nocheck

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z.-]+))?(?:\+[0-9a-z.-]+)?$/i;
const CAP = 1000;

/**
 * The tags newer than the release `since` ({ tag, commit }), in the order
 * given. A tag is newer when its commit descends from the release's commit
 * on first-parent history; when it doesn't, or the walk can't tell, by
 * semver order of the names. Every tag is newer than no release.
 * `parent(oid)` is a commit's first parent, or null at the root or when the
 * commit isn't there.
 */
export async function newerTags(since, tags, parent, cap = CAP) {
	if (!since) return tags.map((t) => t.name);
	const memo = new Map([[since.commit, true]]);
	const out = [];
	for (const t of tags) {
		const after = t.commit !== since.commit && (await descends(t.commit, memo, parent, cap));
		if (after || compareVersions(t.name, since.tag) > 0) out.push(t.name);
	}
	return out;
}

async function descends(oid, memo, parent, cap) {
	const path = [];
	let current = oid;
	let result = false;
	let known = true;
	while (current) {
		if (memo.has(current)) {
			result = memo.get(current);
			break;
		}
		if (path.length === cap) {
			known = false;
			break;
		}
		path.push(current);
		current = await parent(current);
	}
	if (known) for (const p of path) memo.set(p, result);
	return result;
}

/**
 * Semver order of two tag names, with or without a leading v. A name that
 * isn't a version sorts below one that is.
 */
export function compareVersions(a, b) {
	const x = SEMVER.exec(a);
	const y = SEMVER.exec(b);
	if (!x || !y) return Number(Boolean(x)) - Number(Boolean(y));
	for (let i = 1; i <= 3; i++) {
		const d = Number(x[i]) - Number(y[i]);
		if (d) return Math.sign(d);
	}
	if (!x[4] || !y[4]) return Number(!x[4]) - Number(!y[4]);
	const p = x[4].split('.');
	const q = y[4].split('.');
	for (let i = 0; i < Math.max(p.length, q.length); i++) {
		if (p[i] === undefined || q[i] === undefined) return p[i] === undefined ? -1 : 1;
		if (p[i] === q[i]) continue;
		const m = /^\d+$/.test(p[i]);
		const n = /^\d+$/.test(q[i]);
		if (m && n) return Math.sign(Number(p[i]) - Number(q[i]));
		if (m !== n) return m ? -1 : 1;
		return p[i] < q[i] ? -1 : 1;
	}
	return 0;
}
