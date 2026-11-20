import { invalidate } from '$app/navigation';
import { initials } from '$lib/initials';
import { relativeTime } from '$lib/time';
import { signerName } from '$lib/release-flow.js';
import type { Changes, Pending, RepoRelease, Signer } from '$lib/server/release-service';

export { releaseProgress, shortKey, signerName } from '$lib/release-flow.js';

export type {
	AppInfo,
	Candidates,
	Changes,
	Check,
	Inspection,
	KeySummary,
	Pending,
	PearKey,
	Release,
	RepoRelease,
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

export function signerInitials(s: Signer) {
	if (s.label) return initials(s.label);
	return s.me ? 'You' : s.key.slice(0, 2).toUpperCase();
}

// What a pending proposal is called: the tag it releases.
export function proposalName(p: Pending, fallback = 'A release') {
	return p.release?.name ?? fallback;
}

// A key with more than one signer: its releases get the full seal.
export function multisig(signers: number) {
	return signers >= 2;
}

// A signed tag's page.
export function tagHref(key: string, tag: string) {
	return `/releases/${key}/tag/${encodeURI(tag)}`;
}

// A release's page in its repo. `key` names the release key, for a repo
// with more than one.
export function repoReleaseHref(repo: string, tag: string, key?: string) {
	return `/${repo}/releases/${encodeURI(tag)}` + (key ? `?key=${key}` : '');
}

type KeyRef = { key: string; repo: { name: string } | null };

// A signed tag's page: in its repo when the key has one here.
export function signedHref(key: KeyRef, tag: string) {
	return key.repo ? repoReleaseHref(key.repo.name, tag) : tagHref(key.key, tag);
}

// A release in progress: in its repo once its tag is known, on the key
// otherwise.
export function proposalHref(key: KeyRef, p: { id: string; release: { tag: string } | null }) {
	return key.repo && p.release
		? repoReleaseHref(key.repo.name, p.release.tag)
		: `/releases/${key.key}/${p.id}`;
}

// Where a repo's release badge links: the release in progress, the latest
// release, or the key.
export function releaseHref(r: RepoRelease, repo: string) {
	if (r.pending) {
		return r.pending.tag
			? repoReleaseHref(repo, r.pending.tag)
			: `/releases/${r.key}/${r.pending.id}`;
	}
	if (r.tag !== null) return repoReleaseHref(repo, r.tag);
	return `/releases/${r.key}`;
}

// A release in progress in one line: its name, step and what it waits on.
export function progressLine(
	name: string | null,
	progress: { step: number; steps: number; text: string }
) {
	return `${name ?? 'A release'} · step ${progress.step} of ${progress.steps} · ${progress.text}`;
}

// The key inside a git+pear:// link.
export function linkKey(url: string) {
	return /^git\+pear:\/\/(?:\d+\.\d+\.)?([^/]+)/.exec(url)?.[1] ?? null;
}

// How to get a release: the release key's commands, pinned to the length
// it is signed to, and the .npmrc lines npm needs to fetch over git+pear.
// npm can't parse git+pear://, so it takes git+file://pear/, which the
// git+pear executable maps back. `pear` adds pear install, for Pear apps.
export function installCommands(
	name: string,
	source: { key: string; length: number },
	tag: string,
	pear = false
) {
	const pinned = `0.${source.length}.${source.key}/${name}`;
	return {
		npm: `npm install git+file://pear/${pinned}#${tag}`,
		git: `git clone git+pear://${source.key}/${name} && cd ${name} && git checkout ${tag}`,
		pear: pear ? `pear install git+pear://${source.key}/${name}` : null,
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
