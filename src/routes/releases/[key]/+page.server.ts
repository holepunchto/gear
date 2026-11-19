import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { attempt, getReleases, ReleaseError } from '$lib/server/release-service';
import { openRepo, getTagRefs } from '$lib/server/repo';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);

	const key = await releases.getKey(params.key).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});

	// Newest tags first, so the one just pushed is the default.
	const remote = key.repo && (await openRepo(locals.db, key.repo.name));
	const tags = remote
		? (await getTagRefs(remote))
				.sort((a, b) => (b.commit?.timestamp ?? 0) - (a.commit?.timestamp ?? 0))
				.map((t) => t.name)
		: [];

	const responses = Object.fromEntries(
		await Promise.all(
			key.pending.map(async (p) => [p.id, await releases.myResponse(key.key, p.id)] as const)
		)
	);

	return { seat: releases.seatKey, key, history: await releases.history(key.key), tags, responses };
};

export const actions: Actions = {
	propose: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('propose', async () => ({
			id: await releases.propose(params.key, String(form.get('tag') ?? ''))
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

	withdraw: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		await releases.withdraw(params.key, String(form.get('id')));
		return { withdraw: { ok: true } };
	}
};
