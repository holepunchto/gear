import { error } from '@sveltejs/kit';
import {
	ReleaseError,
	type Changes,
	type Inspection,
	type Releases
} from '$lib/server/release-service';

// What a release's pages load, in the repo and under /releases.

const CHANGES_CAP = 100;

// A release in progress: its flow.
export async function proposalPage(
	releases: Releases,
	params: { key: string; id: string },
	url: URL
) {
	const [key, proposal] = await Promise.all([
		releases.getKey(params.key),
		releases.getProposal(params.key, params.id)
	]).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});

	// Inspecting replicates the staging core, so it streams in after paint.
	const inspection: Promise<Inspection> = releases
		.inspect(params.key, params.id)
		.catch((err) => ({ ok: false, error: (err as Error).message, checks: [] }));
	const changes: Promise<Changes | null> = releases
		.proposalChanges(params.key, params.id)
		.catch(() => null);

	return {
		seat: releases.seatKey,
		key,
		proposal,
		response: await releases.myResponse(params.key, params.id),
		inspection,
		changes,
		app: key.repo ? await releases.app(key.repo.name) : null,
		// Why signing failed when it was proposed: the Sign step says it.
		signError: url.searchParams.get('error')
	};
}

// A signed release.
export async function signedPage(releases: Releases, params: { key: string; tag: string }) {
	const [key, { release, newer, older }] = await Promise.all([
		releases.getKey(params.key),
		releases.release(params.key, params.tag)
	]).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});

	const changes = await releases.changes(key.key, release.tag, CHANGES_CAP);
	const app = key.repo ? await releases.app(key.repo.name) : null;

	// The repo's name: the library copy when there is one, otherwise the name
	// the key knows it by, or the key's first segment. The link clones the
	// release key, pinned to its signed length.
	const name = changes?.repo ?? key.repo?.name ?? key.name.split('/')[0];
	const url = `git+pear://0.${key.length}.${key.key}/${name}`;

	return {
		key,
		release,
		previous: older,
		next: newer,
		changes,
		name,
		url,
		pear: app?.pear ?? false
	};
}
