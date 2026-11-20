import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { attempt, failure, getReleases } from '$lib/server/release-service';
import { proposalPage } from '$lib/server/release-pages';

export const load: PageServerLoad = async ({ locals, params, depends, url }) => {
	depends('releases');
	const releases = await getReleases(locals.db);

	// Once its tag is known, a release opens in its repo when that is here.
	const tag = await releases
		.getProposal(params.key, params.id)
		.then((p) => p.release?.tag ?? null)
		.catch(() => null);
	const path = tag && (await releases.releasePath(params.key, tag));
	if (path) {
		// Keeps ?error=, why signing failed.
		const to = new URL(path, url);
		const signError = url.searchParams.get('error');
		if (signError) to.searchParams.set('error', signError);
		throw redirect(303, to.pathname + to.search);
	}

	return proposalPage(releases, params, url);
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
