// Commit timestamps are unix seconds everywhere in gip, so these all take
// seconds rather than ms — passing Date.now() straight in is the trap.

/**
 * Short relative time in the shape git/GitHub use. Tooltips carry the full
 * ISO date, so this stays terse enough for a table cell.
 */
export function relativeTime(timestampSeconds: number) {
	const ms = Date.now() - timestampSeconds * 1000;
	if (ms < 60_000) return 'just now';
	const m = Math.floor(ms / 60_000);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	const mo = Math.floor(d / 30);
	if (mo < 12) return `${mo}mo ago`;
	return `${Math.floor(mo / 12)}y ago`;
}

export function isoDate(timestampSeconds: number) {
	return new Date(timestampSeconds * 1000).toISOString();
}

// Recency window for the apricot accent — anything newer gets the "fresh"
// treatment so the eye picks up activity at a glance.
const RECENT_MS = 24 * 60 * 60 * 1000;

export function isRecent(timestampSeconds: number) {
	return Date.now() - timestampSeconds * 1000 < RECENT_MS;
}
