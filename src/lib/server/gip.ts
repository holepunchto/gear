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
			if (!db.blind) {
				for (const peer of BLIND_PEERS) await db.addBlindPeer(peer);

				// Blind peers are now persisted but only take effect on next startup
				// via config. For the current session, wire them up manually.
				const keys = BLIND_PEERS.map((p: string) => hid.decode(p));
				const wakeup = new Wakeup();
				const d = db as any;
				d._wakeup = wakeup;
				d._blind = new BlindPeering(db.swarm!.dht, d._store, { wakeup, keys });
				log(`blind peering wired (${BLIND_PEERS.length} peers)`);
			}
			log('gip db ready');
			return db;
		});
	}
	return g.__gip!;
}
