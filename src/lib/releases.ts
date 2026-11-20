import { invalidate } from '$app/navigation';
import { initials } from '$lib/initials';
import { relativeTime } from '$lib/time';
import type { Changes, Pending, RepoRelease, Signer } from '$lib/server/release-service';

export type {
	Candidates,
	Changes,
	Check,
	Inspection,
	KeySummary,
	Pending,
	Release,
	RepoRelease,
	Rotate,
	Signer,
	Successor,
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

// What a pending proposal is called: its release, or the key it rotates to.
export function proposalName(p: Pending, fallback = 'A release') {
	if (p.rotate) return `Rotation to ${p.rotate.name ?? shortKey(p.rotate.to)}`;
	return p.release?.name ?? fallback;
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

// How to get a release: npm and git commands pinned to the repo length it
// was cut from, and the .npmrc lines npm needs to fetch over git+pear. npm
// can't parse git+pear://, so it takes git+file://pear/, which the git+pear
// executable maps back.
export function installCommands(
	name: string,
	source: { key: string; length: number },
	tag: string
) {
	const pinned = `0.${source.length}.${source.key}/${name}`;
	return {
		npm: `npm install git+file://pear/${pinned}#${tag}`,
		git: `git clone git+pear://${pinned} && cd ${name} && git checkout ${tag}`,
		npmrc: 'git=git+pear\nallow-git=all'
	};
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

// What a release's changes amount to, in a line. `count` is the number
// walked, which can be more than the commits sent.
export function changesSummary(c: Changes, count = c.commits.length) {
	const commits = (n: number | string) => `${n} commit${n === 1 ? '' : 's'}`;
	const prev = c.since?.name;
	switch (c.status) {
		case 'missing':
			return `The release commits aren't in your copy of ${c.repo} yet`;
		case 'reached':
			return count === 0 ? `No new commits since ${prev}` : `${commits(count)} since ${prev}`;
		case 'forked':
			return `${commits(count)} since ${prev}, which was tagged off this history at ${c.base?.slice(0, 7)}`;
		case 'first':
			return `First release · ${commits(count)} up to it`;
		case 'unrelated':
			return `${prev}'s commit isn't in this release's history · ${commits(count)} up to it`;
		case 'capped':
			return prev
				? `Stopped after ${commits(count)} without reaching ${prev}`
				: `First release · showing the latest ${commits(count)}`;
	}
}
