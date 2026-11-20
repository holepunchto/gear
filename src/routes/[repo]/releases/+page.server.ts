import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { failure, getReleases, type Releases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, parent, depends }) => {
	depends('releases');
	const { repo } = await parent();
	const releases = await getReleases(locals.db);
	const keys = await releases.forRepo(repo.key);
	// Retired and revoked keys go after the ones releases come from.
	const active = keys
		.filter((k) => !k.archived && k.format === 'mirror')
		.sort((a, b) => rank(a) - rank(b));
	return {
		keys: await Promise.all(active.map((k) => releases.details(k.key))),
		archived: keys.filter((k) => k.archived).length,
		// With no key yet, New release makes one first.
		setup:
			active.length === 0 ? { seat: releases.seatKey, pearKeys: await releases.pearKeys() } : null
	};
};

export const actions: Actions = {
	// The repo's first release key. The tab goes on to the release.
	createKey: async ({ request, locals, params }) => {
		const form = await request.formData();
		const keys = form.getAll('signer').map(String);
		const labels = form.getAll('label').map(String);
		const releases = await getReleases(locals.db);

		let made: { key: string; existed: boolean };
		try {
			made = await releases.createKey({
				name: String(form.get('name') ?? ''),
				repo: params.repo,
				signers: keys.map((key, i) => ({ key, label: labels[i] ?? '' })),
				quorum: Number(form.get('quorum')),
				signAs: String(form.get('signAs') ?? '') || undefined
			});
		} catch (err) {
			return failure('createKey', err);
		}
		// The same key is already here, maybe for another repo: open it and say so.
		if (made.existed) throw redirect(303, `/releases/${made.key}?existed`);
		return { key: made.key };
	},

	propose: async ({ request, locals }) => {
		const form = await request.formData();
		const key = String(form.get('key') ?? '');
		const tag = String(form.get('tag') ?? '');
		const releases = await getReleases(locals.db);
		let proposed: { id: string; error: string | null };
		try {
			proposed = await releases.propose(key, tag, password(form));
		} catch (err) {
			return failure('propose', err);
		}
		// Signed alone: it is publishing, so the release opens on it done.
		await releases.landed(key, proposed.id);
		throw redirect(303, await release(releases, key, tag, proposed.error));
	},

	proposeNew: async ({ request, locals }) => {
		const form = await request.formData();
		const key = String(form.get('key') ?? '');
		const tag = String(form.get('name') ?? '').trim();
		const releases = await getReleases(locals.db);
		let proposed: { id: string; error: string | null };
		try {
			proposed = await releases.proposeNewTag(
				key,
				tag,
				String(form.get('target') ?? ''),
				password(form)
			);
		} catch (err) {
			return failure('propose', err);
		}
		await releases.landed(key, proposed.id);
		throw redirect(303, await release(releases, key, tag, proposed.error));
	}
};

// The release's page in the repo. A signature that failed opens its Sign
// step with why.
async function release(releases: Releases, key: string, tag: string, error: string | null) {
	const path = (await releases.releasePath(key, tag)) ?? `/releases/${key}`;
	if (!error) return path;
	return path + (path.includes('?') ? '&' : '?') + `error=${encodeURIComponent(error)}`;
}

// A pear key's password, posted over loopback to sign one entry. Never
// stored or logged.
function password(form: FormData) {
	const value = form.get('password');
	return value ? String(value) : undefined;
}

function rank(k: { revoked: boolean; retiredTo: string | null }) {
	return k.revoked ? 2 : k.retiredTo ? 1 : 0;
}
