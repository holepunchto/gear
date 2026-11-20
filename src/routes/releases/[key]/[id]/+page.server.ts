import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { attempt, getReleases, ReleaseError, type Inspection } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);

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

	return {
		seat: releases.seatKey,
		key,
		proposal,
		response: await releases.myResponse(params.key, params.id),
		inspection
	};
};

export const actions: Actions = {
	sign: async ({ locals, params }) => {
		const releases = await getReleases(locals.db);
		return attempt('sign', async () => ({
			response: await releases.sign(params.key, params.id)
		}));
	}
};
