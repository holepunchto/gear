import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { attempt, getReleases, ReleaseError } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);

	const details = await releases.details(params.key).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});

	return { seat: releases.seatKey, ...details };
};

export const actions: Actions = {
	propose: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('propose', async () => ({
			id: await releases.propose(params.key, String(form.get('tag') ?? ''))
		}));
	},

	proposeNew: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('propose', async () => ({
			id: await releases.proposeNewTag(
				params.key,
				String(form.get('name') ?? '').trim(),
				String(form.get('target') ?? '')
			)
		}));
	},

	sign: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('sign', async () => ({
			response: await releases.sign(params.key, String(form.get('id')))
		}));
	},

	respond: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('respond', async () => {
			await releases.addResponse(
				params.key,
				String(form.get('id')),
				String(form.get('response') ?? '')
			);
			return { ok: true };
		});
	},

	commit: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('commit', () => releases.commit(params.key, String(form.get('id'))));
	},

	rotate: async ({ request, locals, params }) => {
		const form = await request.formData();
		const keys = form.getAll('signer').map(String);
		const labels = form.getAll('label').map(String);
		const releases = await getReleases(locals.db);
		return attempt('rotate', async () => ({
			id: await releases.proposeRotate(params.key, {
				name: String(form.get('name') ?? ''),
				signers: keys.map((key, i) => ({ key, label: labels[i] ?? '' })),
				quorum: Number(form.get('quorum'))
			})
		}));
	},

	archive: async ({ locals, params }) => {
		const releases = await getReleases(locals.db);
		await releases.archive(params.key);
		return { archive: { ok: true } };
	},

	unarchive: async ({ locals, params }) => {
		const releases = await getReleases(locals.db);
		await releases.unarchive(params.key);
		return { unarchive: { ok: true } };
	},

	withdraw: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		await releases.withdraw(params.key, String(form.get('id')));
		return { withdraw: { ok: true } };
	}
};
