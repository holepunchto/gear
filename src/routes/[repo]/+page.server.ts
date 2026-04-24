import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { openRepo } from '$lib/server/repo';

// /[repo] — bounce to the default ref, or render the empty-repo state
// from +page.svelte if nothing has been pushed yet.
export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { repo } = await parent();
	if (repo.head) {
		// Preserve query (e.g. ?forkedFrom=...) across the redirect so the UI
		// can pick it up on the final page.
		throw redirect(307, `/${params.repo}/${repo.head}/${url.search}`);
	}
	return { empty: true };
};

const REPO_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const actions: Actions = {
	delete: async ({ params, locals }) => {
		const ok = await locals.db.deleteRemote(params.repo);
		if (!ok) return fail(404, { delete: { error: 'Repository not found' } });
		throw redirect(303, '/');
	},

	// Fork — create a new writable remote that's a snapshot of the source's
	// refs + objects. Relationship tracking lives in the UI (localStorage)
	// for now; once gip-transport exposes parent metadata we'll mirror it
	// server-side and drop the client record.
	fork: async ({ params, request, locals }) => {
		const form = await request.formData();
		const name = (form.get('name') ?? '').toString().trim();

		if (!name) {
			return fail(400, { fork: { error: 'Name is required', value: name } });
		}
		if (!REPO_NAME_PATTERN.test(name)) {
			return fail(400, {
				fork: { error: 'Name may only contain letters, numbers, dashes and underscores', value: name }
			});
		}
		if (name === params.repo) {
			return fail(400, { fork: { error: 'Fork must have a different name', value: name } });
		}

		// Ensure a repo with that name doesn't already exist.
		const existing = await openRepo(locals.db, name);
		if (existing) {
			return fail(409, { fork: { error: 'A repository with that name already exists', value: name } });
		}

		const src = await openRepo(locals.db, params.repo);
		if (!src) {
			return fail(404, { fork: { error: 'Source repository not found', value: name } });
		}

		const srcHead = await src.getHead();
		const srcRefs = await src.getAllRefs();

		let dst;
		try {
			dst = await locals.db.createRemote(name);
		} catch (err) {
			return fail(500, {
				fork: { error: (err as Error).message || 'Failed to create repository', value: name }
			});
		}

		try {
			for (const { ref, oid } of srcRefs) {
				// getRefObjects returns [{ type, size, data, id }] — convert to
				// the Map<oid, {type,size,data}> shape that push() expects.
				const objs = await src.getRefObjects(oid);
				if (!objs.length) continue;

				const objectsMap = new Map<string, { type: string; size: number; data: Uint8Array }>();
				for (const o of objs) {
					objectsMap.set(o.id, { type: o.type, size: o.size, data: o.data });
				}

				let refName: string;
				if (ref.startsWith('refs/heads/')) {
					refName = ref.slice('refs/heads/'.length);
				} else if (ref.startsWith('refs/tags/')) {
					// push() differentiates tags by a 'tags/' prefix on refName.
					refName = 'tags/' + ref.slice('refs/tags/'.length);
				} else {
					continue;
				}

				await dst.push(refName, oid, objectsMap);
			}

			if (srcHead) {
				await dst.setHead(srcHead);
			}
		} catch (err) {
			// Best-effort rollback of the half-copied remote so we don't leave
			// a broken entry in the list.
			await locals.db.deleteRemote(name).catch(() => {});
			return fail(500, {
				fork: { error: (err as Error).message || 'Failed to copy refs', value: name }
			});
		}

		throw redirect(303, `/${name}?forkedFrom=${encodeURIComponent(params.repo)}`);
	}
};
