import process from 'process';
import { GipLocalDB } from 'gip-transport';
import { isAndroid, isIOS } from 'which-runtime';
import { persistent } from 'bare-storage';
import BlindPeering from 'blind-peering';
import Wakeup from 'protomux-wakeup';
import hid from 'hypercore-id-encoding';
import { log } from './log.js';

// Re-export the runtime type so App.Locals can reference it.
export type GipDB = InstanceType<typeof GipLocalDB>;

const BLIND_PEERS = [
	'tbtdorenxdtwh8ppnhhswa7ua5kc3g45341mzdcaic6jg647xr3y',
	'9mht63egrgxsumbsnftx89cntxopco9sopy98inubcweqz71fpby'
];

// Keet dev blind peers Gear shipped with until Nov 2026. They are offline, and
// installs that stored them keep them in config, so drop them on start.
const RETIRED_BLIND_PEERS = [
	'qiysd9x3cwk47wb1khrbiw1ie8gj9uttnt3mwcgr9obthb96kxxo',
	'4esc4a9go8rcad43kkgtrr4uyqssuo1w9p1ozyy3b14jzq77fijy'
];

const g = globalThis as unknown as { __gip?: Promise<GipDB> };

export function getDB(): Promise<GipDB> {
	if (!g.__gip) {
		// GEAR_STORAGE points the whole stack at another store — lets a dev
		// server run beside a packaged app without fighting over ~/.gip.
		const dir = process.env.GEAR_STORAGE ?? (isAndroid || isIOS ? persistent() : undefined);
		const db = new GipLocalDB({ dir });
		log(`gip db opening (dir: ${dir ?? '~/.gip'})`);
		g.__gip = db.ready().then(async () => {
			let changed = false;
			for (const peer of RETIRED_BLIND_PEERS) {
				if (await db.removeBlindPeer(peer)) changed = true;
			}
			const configured = await db.getBlindPeers();
			for (const peer of BLIND_PEERS) {
				if (configured.includes(peer)) continue;
				await db.addBlindPeer(peer);
				changed = true;
			}

			// Config is only read at startup, so apply a change to this session by hand.
			if (changed || !db.blind) {
				const keys = (await db.getBlindPeers()).map((p: string) => hid.decode(p));
				const d = db as any;
				if (d._blind) {
					d._blind.setKeys(keys);
				} else {
					const wakeup = new Wakeup();
					d._wakeup = wakeup;
					d._blind = new BlindPeering(db.swarm!.dht, d._store, { wakeup, keys });
				}
				log(`blind peering wired (${keys.length} peers)`);
			}
			log('gip db ready');
			return db;
		});
	}
	return g.__gip!;
}
