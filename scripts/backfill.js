#!/usr/bin/env node
// Re-run push() over every writable repo in a gip store so records written
// by older gip-remote versions gain their @gip/file-commits attribution
// rows. Rebuilds each branch's full pack from the store — the same path a
// fork takes — so no git, no network, and cores/keys/urls stay put.
import { resolve } from 'path';
import { GipLocalDB } from 'gip-transport';
import paparam from 'paparam';

const { command, flag, summary } = paparam;

const cmd = command(
	'backfill',
	summary('Re-push every writable repo in a store to backfill file attributions'),
	flag('--dir <path>', 'Store directory (default ~/.gip; use mirror/store for the mirror)')
);
cmd.parse(process.argv.slice(2));

const dir = cmd.flags.dir ? resolve(cmd.flags.dir) : undefined;

const db = new GipLocalDB({ dir });
await db.ready();

try {
	const names = await db.getRepoNames();
	for (const name of names) {
		const remote = await db.getRepo(name);
		if (!remote || !remote.core.writable) {
			console.log(`skip ${name} (not writable)`);
			continue;
		}

		const refs = await remote.getAllRefs();
		for (const { ref, oid } of refs) {
			if (!ref.startsWith('refs/heads/')) continue;
			const branch = ref.slice('refs/heads/'.length);

			const objs = await remote.getRefObjects(oid);
			const objects = new Map();
			for (const o of objs) objects.set(o.id, { type: o.type, size: o.size, data: o.data });

			await remote.push(branch, oid, objects);
			console.log(`backfilled ${name}#${branch} (${objects.size} objects)`);
		}
	}
} finally {
	await db.close();
}
