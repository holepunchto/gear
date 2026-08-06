import type { GipDB } from './gip.js';
import { log } from './log.js';

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

// The available-repo list ships baked into the app via hyperconf, so it works
// with no network. The gear-ota core carries newer config blocks; whenever one
// replicates in, conf.current flips to it — updates OTA without a new build.
export async function getAllSourceRepos(gip: GipDB): Promise<SourceRepoData> {
	if (!g.__ota) g.__ota = open(gip);
	const conf = await g.__ota;
	return conf.current?.sources.find((s) => s.name === 'holepunch') ?? EMPTY;
}

async function open(gip: GipDB) {
	const { default: Hyperconf } = await import('hyperconf');
	const { spec, key } = (await import('gear-ota')).default;
	const { default: hid } = await import('hypercore-id-encoding');

	const d = gip as any;
	const core = d._store.namespace('ota').get({ key: hid.decode(key) });
	await core.ready();

	// Fetch updates from whoever announces the core, and ask the blind peers
	// to mirror it so updates stay available while the writer is offline.
	d.swarm.join(core.discoveryKey, { server: false, client: true });
	d.blind?.addCoreBackground(core);

	const conf = new Hyperconf(spec, core);
	await conf.ready();
	log(`ota ready — ${repoCount(conf)} repos (core ${key} length ${core.length})`);
	conf.on('update', () => log(`ota update — ${repoCount(conf)} repos (length ${core.length})`));
	return conf;
}

function repoCount(conf: { current: SourceConfig | null }) {
	return conf.current?.sources.reduce((n, s) => n + s.repos.length, 0) ?? 0;
}
