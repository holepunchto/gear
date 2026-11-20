import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { failure, getReleases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals }) => {
	const releases = await getReleases(locals.db);
	return {
		seat: releases.seatKey,
		pearKeys: await releases.pearKeys(),
		repos: (await locals.db.getRepoNames()) as string[]
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const keys = form.getAll('signer').map(String);
		const labels = form.getAll('label').map(String);
		const releases = await getReleases(locals.db);

		let made: { key: string; existed: boolean };
		try {
			made = await releases.createKey({
				name: String(form.get('name') ?? ''),
				repo: String(form.get('repo') ?? ''),
				signers: keys.map((key, i) => ({ key, label: labels[i] ?? '' })),
				quorum: Number(form.get('quorum')),
				signAs: String(form.get('signAs') ?? '') || undefined
			});
		} catch (err) {
			return failure('create', err);
		}
		const { key } = made;
		// The same key is already here, maybe for another repo: open it and say so.
		if (made.existed) throw redirect(303, `/releases/${key}?existed`);
		throw redirect(303, `/releases/${key}`);
	}
};
