import { fail } from '@sveltejs/kit';
import Id from 'hypercore-id-encoding';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const publicKey = await locals.db.getPublicKey();
	const blindPeers = await locals.db.getBlindPeers();

	const swarm = (locals.db as unknown as { swarm?: { connections?: Set<unknown>; dht?: { nodes?: { length: number } } } }).swarm;
	const connections = swarm?.connections?.size ?? 0;
	const dhtNodes = swarm?.dht?.nodes?.length ?? 0;

	return {
		identity: Id.encode(publicKey),
		blindPeers,
		stats: {
			connections,
			dhtNodes
		}
	};
};

export const actions: Actions = {
	addPeer: async ({ request, locals }) => {
		const form = await request.formData();
		const peerKey = (form.get('peerKey') ?? '').toString().trim();

		if (!peerKey) {
			return fail(400, { addPeer: { error: 'Peer key is required', value: peerKey } });
		}

		try {
			Id.decode(peerKey);
		} catch {
			return fail(400, { addPeer: { error: 'Not a valid public key', value: peerKey } });
		}

		try {
			await locals.db.addBlindPeer(peerKey);
		} catch (err) {
			return fail(500, {
				addPeer: { error: (err as Error).message || 'Failed to add peer', value: peerKey }
			});
		}

		return { addPeer: { ok: true } };
	},

	removePeer: async ({ request, locals }) => {
		const form = await request.formData();
		const peerKey = (form.get('peerKey') ?? '').toString();
		if (!peerKey) return fail(400, { removePeer: { error: 'Missing peer key' } });

		const removed = await locals.db.removeBlindPeer(peerKey);
		if (!removed) return fail(404, { removePeer: { error: 'Peer not found' } });

		return { removePeer: { ok: true } };
	}
};
