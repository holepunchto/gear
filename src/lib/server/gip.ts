import { GipLocalDB } from 'gip-transport';
import { isAndroid, isIOS } from 'which-runtime';
import { persistent } from 'bare-storage';

// Re-export the runtime type so App.Locals can reference it.
export type GipDB = InstanceType<typeof GipLocalDB>;

const g = globalThis as unknown as { __gip?: Promise<GipDB> };

export function getDB(): Promise<GipDB> {
	if (!g.__gip) {
		const dir = isAndroid || isIOS ? persistent() : undefined;
		const db = new GipLocalDB({ dir });
		g.__gip = db.ready().then(() => db);
	}
	return g.__gip;
}
