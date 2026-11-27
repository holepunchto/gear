import { fail } from '@sveltejs/kit';
import Id from 'hypercore-id-encoding';
import { events } from '$lib/server/events';
import { cliStatus, installCli, INSTALL_COMMAND } from '$lib/server/cli';
import { getReleases } from '$lib/server/release-service';
import {
	getUpdateState,
	getBuildLog,
	applyUpdate,
	checkUpdate,
	canRestart,
	restart
} from '$lib/server/pear';
import pkg from '../../../package.json' with { type: 'json' };
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
	const releases = await getReleases(locals.db);

	return {
		identity: Id.encode(publicKey),
		signingKey: releases.seatKey,
		pearKeys: await releases.pearKeys(),
		blindPeers,
		seedReadOnly,
		cli: cliStatus(),
		installCommand: INSTALL_COMMAND,
		version: pkg.version,
		update: getUpdateState(),
		buildLog: getBuildLog(),
		canRestart: canRestart(),
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

	// Nothing is built until this is called. The rebuild takes minutes and the
	// request stays open for all of it — progress arrives over SSE, so the page
	// is not waiting on the response to show what is happening.
	applyUpdate: async () => {
		const result = await applyUpdate();
		if (!result.ok) return fail(500, { applyUpdate: { error: result.error } });
		return { applyUpdate: { ok: true } };
	},

	check: async () => {
		const result = await checkUpdate();
		if (!result.ok) {
			return fail(500, { check: { found: null, none: null, error: result.error } });
		}
		return { check: { found: result.found ?? null, none: result.none ?? null, error: null } };
	},

	// Answers, then exits — so the page should not count on this response
	// arriving. It only reports a failure that happened before the process went
	// away, such as a platform with nothing to relaunch.
	restart: async () => {
		const result = restart();
		if (!result.ok) return fail(500, { restart: { error: result.error } });
		return { restart: { ok: true } };
	},

	installCli: async () => {
		const result = await installCli();
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
