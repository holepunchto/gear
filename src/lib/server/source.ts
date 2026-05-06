import BundlebeeImport from 'bundlebee-import';
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

export async function getAllSourceRepos(gip: GipDB): Promise<SourceRepoData[]> {
	const { sources } = dev
		? await import('../../../ota/index.js')
		: await BundlebeeImport(
				gip._store.namespace('ota'),
				'bundle+pear://0.4.s5ay5t1sjtdfyd6i7zcaptfq899t4ek5bpy7779y6t6c4ny5euho/index.js',
				{ swarm: gip.swarm }
			);

	return sources?.holepunch || [];
}
