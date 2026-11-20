import type { GipDB } from './gip.js';
import { events } from './events.js';
import { log } from './log.js';
import Hyperconf from 'hyperconf';
import ota from 'gear-ota';
import hid from 'hypercore-id-encoding';

export type SourceRepo = {
	name: string;
	url: string;
	description?: string | null;
};

export type SourceRepoData = {
	blindPeers: string[];
	repos: SourceRepo[];
};

type SourceConfig = { sources: ({ name: string } & SourceRepoData)[] };

const EMPTY: SourceRepoData = { blindPeers: [], repos: [] };

const g = globalThis as unknown as { __ota?: Promise<{ current: SourceConfig | null }> };

export async function getAllSourceRepos(gip: GipDB): Promise<SourceRepoData> {
	if (!g.__ota) g.__ota = open(gip);
	const conf = await g.__ota;
	return conf.current?.sources.find((s) => s.name === 'holepunch') ?? EMPTY;
}

async function open(gip: GipDB) {
	const { spec, key } = ota;

	const d = gip as any;
	const core = d._store.namespace('ota').get({ key: hid.decode(key) });
	await core.ready();

	d.swarm.join(core.discoveryKey, { server: true, client: true });

	const conf = new Hyperconf(spec, core);
	await conf.ready();
	log(`ota ready — ${repoCount(conf)} repos (core ${key} length ${core.length})`);
	conf.on('update', () => {
		log(`ota update — ${repoCount(conf)} repos (length ${core.length})`);
		events.emit('sources');
	});
	return conf;
}

function repoCount(conf: { current: SourceConfig | null }) {
	return conf.current?.sources.reduce((n, s) => n + s.repos.length, 0) ?? 0;
}
