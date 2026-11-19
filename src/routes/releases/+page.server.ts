import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { failure, getReleases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);
	return { seat: releases.seatKey, keys: await releases.listKeys() };
};

export const actions: Actions = {
	receive: async ({ request, locals }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);

		let target: { key: string; id: string };
		try {
			target = await releases.receive(String(form.get('proposal') ?? ''));
		} catch (err) {
			return failure('receive', err);
		}
		throw redirect(303, `/releases/${target.key}/${target.id}`);
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
