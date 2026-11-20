import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { failure, getReleases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, url }) => {
	const releases = await getReleases(locals.db);
	return {
		seat: releases.seatKey,
		pearKeys: await releases.pearKeys(),
		repos: (await locals.db.getRepoNames()) as string[],
		repo: url.searchParams.get('repo')
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const keys = form.getAll('signer').map(String);
		const labels = form.getAll('label').map(String);
		const releases = await getReleases(locals.db);

		let key: string;
		try {
			key = await releases.createKey({
				name: String(form.get('name') ?? ''),
				repo: String(form.get('repo') ?? ''),
				signers: keys.map((key, i) => ({ key, label: labels[i] ?? '' })),
				quorum: Number(form.get('quorum')),
				signAs: String(form.get('signAs') ?? '') || undefined
			});
		} catch (err) {
			return failure('create', err);
		}
		// Made from a repo's Releases tab: back there, to say it was made.
		if (form.has('back')) {
			throw redirect(
				303,
				`/${encodeURIComponent(String(form.get('repo')))}/releases?created=${key}`
			);
		}
		throw redirect(303, `/releases/${key}`);
	}
};
