import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { attempt, failure, getReleases, ReleaseError } from '$lib/server/release-service';

export const load: PageServerLoad = async ({ locals, params, depends, url }) => {
	depends('releases');
	const releases = await getReleases(locals.db);

	const details = await releases.details(params.key).catch((err) => {
		if (err instanceof ReleaseError) throw error(404, err.message);
		throw err;
	});

	// Just rotated here from the key in ?rotated=: the page says what to do
	// about anyone still on it.
	const from = url.searchParams.get('rotated');
	const rotated = from
		? {
				key: from,
				compromised: url.searchParams.has('compromised'),
				name: await releases.getKey(from).then(
					(k) => k.name,
					() => null
				)
			}
		: null;

	return { seat: releases.seatKey, ...details, rotated };
};

export const actions: Actions = {
	propose: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('propose', async () => {
			const id = await releases.propose(params.key, String(form.get('tag') ?? ''), password(form));
			// Signed alone: it is publishing, so the flow page opens on it done.
			await releases.landed(params.key, id);
			return { id };
		});
	},

	proposeNew: async ({ request, locals, params }) => {
		const form = await request.formData();
		const releases = await getReleases(locals.db);
		return attempt('propose', async () => {
			const id = await releases.proposeNewTag(
				params.key,
				String(form.get('name') ?? '').trim(),
				String(form.get('target') ?? ''),
				password(form)
			);
			await releases.landed(params.key, id);
			return { id };
		});
	},

	rotate: async ({ request, locals, params }) => {
		const form = await request.formData();
		const keys = form.getAll('signer').map(String);
		const labels = form.getAll('label').map(String);
		const releases = await getReleases(locals.db);

		let to: string;
		try {
			to = await releases.rotate(params.key, {
				name: String(form.get('name') ?? ''),
				signers: keys.map((key, i) => ({ key, label: labels[i] ?? '' })),
				quorum: Number(form.get('quorum')),
				compromised: form.has('compromised')
			});
		} catch (err) {
			return failure('rotate', err);
		}
		const compromised = form.has('compromised') ? '&compromised' : '';
		throw redirect(303, `/releases/${to}?rotated=${params.key}${compromised}`);
	},

	revoke: async ({ locals, params }) => {
		const releases = await getReleases(locals.db);
		await releases.revoke(params.key);
		return { revoke: { ok: true } };
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
	}
};

// A pear key's password, posted over loopback to sign one entry. Never
// stored or logged.
function password(form: FormData) {
	const value = form.get('password');
	return value ? String(value) : undefined;
}
