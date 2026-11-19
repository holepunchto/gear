import { invalidate } from '$app/navigation';
import { initials } from '$lib/initials';
import { relativeTime } from '$lib/time';
import type { RepoRelease, Signer } from '$lib/server/release-service';

export type {
	Candidates,
	Check,
	Inspection,
	KeySummary,
	Pending,
	Release,
	RepoRelease,
	Signer,
	TagOption
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

// Where a repo's release badge links: the sign view when it waits on you,
// the latest release, or the key.
export function releaseHref(r: RepoRelease) {
	if (r.pending?.waitingOnMe) return `/releases/${r.key}/${r.pending.id}`;
	if (r.index !== null) return `/releases/${r.key}/${r.index}`;
	return `/releases/${r.key}`;
}

// What a pending release is waiting on, or null.
export function releaseWaiting(r: RepoRelease) {
	const p = r.pending;
	if (!p) return null;
	const name = p.name ?? 'A release';
	if (p.waitingOnMe) return `${name} is waiting on your signature`;
	if (p.missing > 0) {
		return `${name} is waiting on ${p.missing} more ${p.missing === 1 ? 'signature' : 'signatures'}`;
	}
	return `${name} is waiting on a commit`;
}

// The key inside a git+pear:// link.
export function linkKey(url: string) {
	return /^git\+pear:\/\/(?:\d+\.\d+\.)?([^/]+)/.exec(url)?.[1] ?? null;
}

// A signer being added to a new key, before it exists.
export type DraftSigner = { key: string; label: string; me: boolean };

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
