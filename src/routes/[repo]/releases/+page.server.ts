import type { Actions, PageServerLoad } from './$types';
import { attempt, getReleases } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, parent, depends }) => {
	depends('releases');
	const { repo } = await parent();
	const releases = await getReleases(locals.db);
	const keys = await releases.forRepo(repo.key);
	return {
		seat: releases.seatKey,
		keys: await Promise.all(keys.map((k) => releases.details(k.key)))
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
				quorum: Number(form.get('quorum'))
			})
		}));
	}
};
