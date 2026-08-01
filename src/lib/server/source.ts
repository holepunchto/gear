import { dev } from '$app/environment';
import type { GipDB } from './gip.js';

export type SourceRepo = {
	name: string;
	url: string;
	description?: string;
};

export type SourceRepoData = {
	blindPeers: string[];
	repos: SourceRepo[];
};

const EMPTY: SourceRepoData = { blindPeers: [], repos: [] };

// The available-repo list is a fixed manifest, not a network query. In dev it
// comes from ./ota on disk; in production it's imported over bundlebee so the
// list can be updated OTA without shipping a new build.
export async function getAllSourceRepos(gip: GipDB): Promise<SourceRepoData> {
	const { sources } = dev ? await import('../../../ota/index.js') : await importOTA(gip);

	return sources?.holepunch ?? EMPTY;
}

async function importOTA(gip: GipDB) {
	const BundlebeeImport = (await import('bundlebee-import')).default;

	return BundlebeeImport(
		gip._store.namespace('ota'),
		'bundle+pear://0.4.s5ay5t1sjtdfyd6i7zcaptfq899t4ek5bpy7779y6t6c4ny5euho/index.js',
		{ swarm: gip.swarm }
	);
}
