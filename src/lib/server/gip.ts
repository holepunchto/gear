import { GipLocalDB } from 'gip-transport';
import process from 'process';

// Re-export the runtime type so App.Locals can reference it.
export type GipDB = InstanceType<typeof GipLocalDB>;

const g = globalThis as unknown as { __gip?: Promise<GipDB> };

export function getDB(): Promise<GipDB> {
	if (!g.__gip) {
		const db = new GipLocalDB();
		g.__gip = db.ready().then(() => db);
	}
	return g.__gip;
}
