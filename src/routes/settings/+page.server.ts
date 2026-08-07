import { fail } from '@sveltejs/kit';
import Id from 'hypercore-id-encoding';
import { events } from '$lib/server/events';
import { cliStatus, installCli, INSTALL_COMMAND } from '$lib/server/cli';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const publicKey = await locals.db.getPublicKey();
	const blindPeers = await locals.db.getBlindPeers();
	const seedReadOnly = await locals.db.getSeedReadOnly();

	// Use the EventHub for stats so the SSR snapshot matches what live SSE
	// updates will produce. `peers` here is swarm connections + connected
	// blind peers — the latter never fire 'connection' on the swarm because
	// blind-peering connects via dht.connect() directly.
	const s = events.getStats();

	return {
		identity: Id.encode(publicKey),
		blindPeers,
		seedReadOnly,
		cli: cliStatus(),
		installCommand: INSTALL_COMMAND,
		stats: {
			connections: s.peers,
			swarmPeers: s.swarmPeers,
			blindPeers: s.blindPeers,
			dhtNodes: s.dhtNodes
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
	},

	installCli: async () => {
		const result = installCli();
		if (!result.ok) return fail(500, { installCli: { error: result.error } });
		return { installCli: { ok: true } };
	},

	// Toggle whether we act as a swarm server for repos we've cloned but
	// don't own. Default ON — turning it off makes us a leech-only client,
	// useful for low-bandwidth/metered connections.
	setSeedReadOnly: async ({ request, locals }) => {
		const form = await request.formData();
		const enabled = form.get('enabled') === 'on';
		await locals.db.setSeedReadOnly(enabled);
		return { setSeedReadOnly: { ok: true, enabled } };
	}
};
