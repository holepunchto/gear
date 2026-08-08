// Tags read as versions far more often than as words, and sorting them as
// words puts v1.10.0 behind v1.2.0. Parse the version-shaped ones and order
// them newest first; anything else falls in behind on numeric-aware
// collation, which at least keeps release-9 before release-10.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const VERSION = /^[vV]?(\d+(?:\.\d+)*)(?:[-+](.+))?$/;

type Version = { parts: number[]; pre: string | null };

function parseVersion(name: string): Version | null {
	const m = VERSION.exec(name);
	if (!m) return null;
	return { parts: m[1].split('.').map(Number), pre: m[2] ?? null };
}

/** Ascending, so `1.9.0` < `1.10.0` and `1.0.0-rc.1` < `1.0.0`. */
function compareVersions(a: Version, b: Version) {
	const len = Math.max(a.parts.length, b.parts.length);
	for (let i = 0; i < len; i++) {
		const diff = (a.parts[i] ?? 0) - (b.parts[i] ?? 0);
		if (diff !== 0) return diff;
	}
	// A release outranks its own prereleases.
	if (a.pre === null || b.pre === null) return a.pre === b.pre ? 0 : a.pre === null ? 1 : -1;
	return collator.compare(a.pre, b.pre);
}

/** Newest version first. Version-shaped tags lead, the rest follow. */
export function compareTags(a: string, b: string) {
	const va = parseVersion(a);
	const vb = parseVersion(b);
	if (va && vb) return compareVersions(vb, va);
	if (va) return -1;
	if (vb) return 1;
	return collator.compare(b, a);
}

/** Default branch first, then alphabetical. */
export function compareBranches(a: string, b: string, headName: string | null) {
	if (a === headName) return -1;
	if (b === headName) return 1;
	return collator.compare(a, b);
}
