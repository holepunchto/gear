import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { attempt, failure, getReleases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, parent, depends }) => {
	depends('releases');
	const { repo } = await parent();
	const releases = await getReleases(locals.db);
	const keys = await releases.forRepo(repo.key);
	// A key that was rotated goes after the key it points to.
	const active = keys
		.filter((k) => !k.archived)
		.sort((a, b) => Number(a.rotatedTo !== null) - Number(b.rotatedTo !== null));
	return {
		seat: releases.seatKey,
		pearKeys: await releases.pearKeys(),
		keys: await Promise.all(active.map((k) => releases.details(k.key))),
		archived: keys.length - active.length
	};
};

export const actions: Actions = {
	createKey: async ({ request, locals, params }) => {
		const form = await request.formData();
		const keys = form.getAll('signer').map(String);
		const labels = form.getAll('label').map(String);
		const releases = await getReleases(locals.db);
		return attempt('create', async () => ({
			key: await releases.createKey({
				name: String(form.get('name') ?? ''),
				repo: params.repo,
				signers: keys.map((key, i) => ({ key, label: labels[i] ?? '' })),
				quorum: Number(form.get('quorum')),
				signAs: String(form.get('signAs') ?? '') || undefined
			})
		}));
	},

	follow: async ({ request, locals }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);

		let key: string;
		try {
			key = await releases.follow(String(form.get('key') ?? ''));
		} catch (err) {
			return failure('follow', err);
		}
		throw redirect(303, `/releases/${key}`);
	}
};
