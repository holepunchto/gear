import { invalidate } from '$app/navigation';
import { initials } from '$lib/initials';
import { relativeTime } from '$lib/time';
import type { Signer } from '$lib/server/release-service';

export type {
	Check,
	Inspection,
	KeySummary,
	Pending,
	Release,
	Signer
} from '$lib/server/release-service';

const AVATARS = [
	'bg-pear-700 text-accent-100',
	'bg-apricot-900 text-apricot-200',
	'bg-pear-800 text-accent-200',
	'bg-pear-600 text-accent-50',
	'bg-[#4a2a12] text-apricot-300'
];

export function avatar(index: number) {
	return AVATARS[index % AVATARS.length];
}

export function shortKey(key: string) {
	return key.slice(0, 4) + '…' + key.slice(-4);
}

export function signerName(s: Signer) {
	return s.label ?? (s.me ? 'You' : shortKey(s.key));
}

export function signerInitials(s: Signer) {
	if (s.label) return initials(s.label);
	return s.me ? 'You' : s.key.slice(0, 2).toUpperCase();
}

// Proposal times are local milliseconds.
export function ago(ms: number) {
	return relativeTime(ms / 1000);
}

// Re-run every load that depends on 'releases' when a key changes anywhere:
// a new entry, a proposal or a signature. Returns the cleanup for onMount.
export function liveReleases() {
	const es = new EventSource('/api/events');
	es.addEventListener('release', () => invalidate('releases'));
	return () => es.close();
}
