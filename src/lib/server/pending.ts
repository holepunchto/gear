import type { GipDB } from './gip';
import { events, type RepoStats } from './events';
import { log } from './log.js';

// Repos being added. openRemote syncs every block before it writes the repo
// record, so until it settles the name only lives here. The page for a
// pending repo shows the sync as it happens instead of waiting on it.

export type PendingAdd = {
	name: string;
	key: Uint8Array;
	error: string | null;
};

type ParseLink = { _parseLink(link: string): { key: Uint8Array; name: string } };

// openRemote takes no signal, so a sync can't be cancelled. Past this long
// without a new block the page says it stalled; the sync keeps running and
// still lands the repo if it finishes.
const STALL_MS = 60_000;

const g = globalThis as unknown as { __pendingAdds?: Map<string, PendingAdd> };
const adds: Map<string, PendingAdd> = g.__pendingAdds ?? (g.__pendingAdds = new Map());

export function getPendingAdd(name: string) {
	return adds.get(name) ?? null;
}

export function getPendingAdds() {
	return [...adds.values()];
}

export function dismissPendingAdd(name: string) {
	if (adds.get(name)?.error) adds.delete(name);
}

/**
 * Start adding a repo by link and return its name without waiting for the
 * sync. A name already in the library or already syncing starts nothing.
 */
export async function startAdd(db: GipDB, link: string, opts: { blindPeerKeys?: Uint8Array[] }) {
	const { key, name } = (db as unknown as ParseLink)._parseLink(link);

	if (adds.get(name)?.error === null) return name;
	if ((await db.getRepoNames()).includes(name)) return name;
	// Again: another add of this name may have started while the names were read.
	if (adds.get(name)?.error === null) return name;

	const add: PendingAdd = { name, key, error: null };
	adds.set(name, add);

	// Whatever the hub held under this name belongs to an earlier core.
	events.forget(name);
	try {
		await events.ensureRepoAttached(db, name, key);
	} catch (e) {
		adds.delete(name);
		throw e;
	}

	const fail = (message: string) => {
		log(`add ${name} failed: ${message}`);
		add.error = message;
		events.emit(`failed:${name}`);
	};

	let held = events.getRepoStats(name)?.held ?? 0;
	let stall = setTimeout(onStall, STALL_MS);
	function onStall() {
		fail('No blocks arrived for a minute. The peers that have this repo may be offline.');
	}
	const onRepo = () => {
		const now = (events.getRepoStats(name) as RepoStats).held;
		if (now === held) return;
		held = now;
		clearTimeout(stall);
		if (add.error === null) stall = setTimeout(onStall, STALL_MS);
	};
	events.on(`repo:${name}`, onRepo);

	log(`add ${name} started`);
	db.openRemote(link, opts)
		.then(async (remote: { core: { length: number; writable: boolean } }) => {
			// update() gives up once discovery finds nobody, and openRemote
			// then records an empty repo. Nothing arrived, so it isn't added.
			if (remote.core.length === 0 && !remote.core.writable) {
				await db.deleteRemote(name);
				fail('No peer has this repo right now.');
				return;
			}
			if (adds.get(name) === add) adds.delete(name);
			log(`add ${name} done (${remote.core.length} blocks)`);
			events.emit(`ready:${name}`);
		})
		.catch((e: Error) => fail(e.message))
		.finally(() => {
			clearTimeout(stall);
			events.off(`repo:${name}`, onRepo);
		});

	return name;
}
