import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	attempt,
	failure,
	getReleases,
	ReleaseError,
	type Changes,
	type Inspection
} from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, params, depends, url }) => {
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
};

export const actions: Actions = {
	sign: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		// A pear key's password, used for this one signature and dropped.
		const password = form.get('password');
		return attempt('sign', async () => ({
			response: await releases.sign(params.key, params.id, password ? String(password) : undefined)
		}));
	},

	respond: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('respond', async () => {
			await releases.addResponse(params.key, params.id, String(form.get('response') ?? ''));
			return { signer: String(form.get('signer') ?? '') };
		});
	},

	publish: async ({ locals, params }) => {
		const releases = await getReleases(locals.db);
		return attempt('publish', () => releases.commit(params.key, params.id));
	},

	autoPublish: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('autoPublish', async () => {
			await releases.setAutoPublish(params.key, params.id, form.get('on') === 'true');
			return { ok: true };
		});
	},

	withdraw: async ({ locals, params }) => {
		const releases = await getReleases(locals.db);
		const key = await releases.getKey(params.key);
		try {
			await releases.withdraw(params.key, params.id);
		} catch (err) {
			return failure('withdraw', err);
		}
		throw redirect(303, key.repo ? `/${key.repo.name}/releases` : `/releases/${params.key}`);
	}
};
