import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { failure, getReleases, ReleaseError } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('releases');
	const releases = await getReleases(locals.db);
	const { key, candidates } = await releases.details(params.key).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});
	return { key, candidates };
};

export const actions: Actions = {
	propose: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		let proposed: { id: string; error: string | null };
		try {
			proposed = await releases.propose(params.key, String(form.get('tag') ?? ''), password(form));
		} catch (err) {
			return failure('propose', err);
		}
		// Signed alone: it is publishing, so the flow page opens on it done.
		await releases.landed(params.key, proposed.id);
		throw redirect(303, flow(params.key, proposed));
	},

	proposeNew: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		let proposed: { id: string; error: string | null };
		try {
			proposed = await releases.proposeNewTag(
				params.key,
				String(form.get('name') ?? '').trim(),
				String(form.get('target') ?? ''),
				password(form)
			);
		} catch (err) {
			return failure('propose', err);
		}
		await releases.landed(params.key, proposed.id);
		throw redirect(303, flow(params.key, proposed));
	}
};

// The release's flow page. A signature that failed opens its Sign step
// with why.
function flow(key: string, { id, error }: { id: string; error: string | null }) {
	return `/releases/${key}/${id}` + (error ? `?error=${encodeURIComponent(error)}` : '');
}

// A pear key's password, posted over loopback to sign one entry. Never
// stored or logged.
function password(form: FormData) {
	const value = form.get('password');
	return value ? String(value) : undefined;
}
