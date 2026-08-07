#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { GipLocalDB } from 'gip-transport';
import Id from 'hypercore-id-encoding';
import paparam from 'paparam';

const { command, flag, summary } = paparam;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCES_PATH = join(ROOT, 'ota/sources.json');
const ORG = 'holepunchto';

// Last-seen GitHub pushed_at per repo — an unchanged repo skips its fetch
// and both pushes entirely (the negotiated no-op push is cheap, but still
// spawns the helper and connects to the swarm twice per repo).
function readState(path) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return {};
	}
}

const cmd = command(
	'mirror',
	summary('Mirror the top N holepunch repos into a dedicated gip store + the ota manifest'),
	flag('--count <n>', 'How many repos, by GitHub stars (default 10)'),
	flag('--repos <names>', 'Mirror these repos instead (comma-separated)'),
	flag('--dir <path>', 'Work directory for the store and clones (default mirror/)'),
	flag('--seed', 'Announce every mirrored repo and stay online')
);

cmd.parse(process.argv.slice(2));
const COUNT = Number(cmd.flags.count ?? 10);
const REPOS = cmd.flags.repos?.split(',').map((s) => s.trim()) ?? null;
// A custom work dir is an experiment — its keys must never reach the real
// manifest, so only the default dir updates ota/sources.json.
const IS_DEFAULT_DIR = !cmd.flags.dir;
const DIR = cmd.flags.dir ?? join(ROOT, 'mirror');
const STORE = join(DIR, 'store');
const CLONES = join(DIR, 'clones');
const STATE = join(DIR, 'state.json');

const repoName = /^[a-zA-Z0-9_-]+$/;

function run(file, args, opts = {}) {
	try {
		return execFileSync(file, args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			...opts
		});
	} catch (err) {
		const stderr = err.stderr?.toString().trim();
		if (stderr) err.message += '\n' + stderr;
		throw err;
	}
}

// ── GitHub ────────────────────────────────────────────────────────────────────

// Everything mirrored lands on public blind peers and in the public
// manifest, so only public repos may ever be queried: requests go out
// unauthenticated (private repos are invisible without credentials — a
// private name 404s) and the org listing is scoped server-side.
const HEADERS = { 'user-agent': 'gear-mirror' };

async function namedRepos(names) {
	const repos = await Promise.all(
		names.map(async (name) => {
			const res = await fetch(`https://api.github.com/repos/${ORG}/${name}`, {
				headers: HEADERS
			});
			if (res.status === 404) {
				console.log(`  ~ ${name}: skipped (not found or not public)`);
				return null;
			}
			if (!res.ok) throw new Error(`GitHub API: ${name}: ${res.status}`);
			return res.json();
		})
	);
	return repos.filter(Boolean);
}

async function topRepos(count) {
	const all = [];
	for (let page = 1; ; page++) {
		const res = await fetch(
			`https://api.github.com/orgs/${ORG}/repos?type=public&per_page=100&page=${page}`,
			{ headers: HEADERS }
		);
		if (!res.ok) throw new Error(`GitHub API: ${res.status} ${await res.text()}`);
		const batch = await res.json();
		all.push(...batch);
		if (batch.length < 100) break;
	}

	return all
		.filter((r) => !r.fork)
		.sort((a, b) => b.stargazers_count - a.stargazers_count)
		.slice(0, count);
}

// ── gip store ─────────────────────────────────────────────────────────────────

// The mirror gets its own corestore so it never contends with ~/.gip. The
// store must be closed while git pushes run — the remote helper opens the
// same directory via the url's ?storage= param.
async function withStore(fn) {
	const db = new GipLocalDB({ dir: STORE });
	await db.ready();
	try {
		return await fn(db);
	} finally {
		await db.close();
	}
}

async function repoUrls(db, names) {
	const urls = new Map();
	for (const name of names) {
		const entry = await db.getCore(name, { server: false, client: false });
		if (entry) urls.set(name, `git+pear://0.${entry.core.length}.${Id.encode(entry.key)}/${name}`);
	}
	return urls;
}

// ── Mirror ────────────────────────────────────────────────────────────────────

function ensureClone(repo) {
	const dir = join(CLONES, `${repo.name}.git`);
	if (existsSync(dir)) {
		run('git', ['-C', dir, 'remote', 'update', '--prune']);
	} else {
		run('git', ['clone', '--mirror', repo.clone_url, dir]);
	}
	return dir;
}

function push(dir, url) {
	const target = `${url}?storage=${encodeURIComponent(STORE)}`;
	run('git', ['-C', dir, 'push', target, '--all']);
	run('git', ['-C', dir, 'push', target, '--tags']);
}

// ── Blind peers ───────────────────────────────────────────────────────────────

// Ask the manifest's blind peers to mirror every repo and stay online until
// they've replicated to each core's full length — without this the data only
// exists on this machine and clients can't sync while it's offline.
async function pushToBlindPeers(db, names, keys, { timeout = 10 * 60_000 } = {}) {
	if (keys.length === 0) return;

	const { default: BlindPeering } = await import('blind-peering');
	const { default: Wakeup } = await import('protomux-wakeup');
	const Id = (await import('hypercore-id-encoding')).default;

	const peerKeys = keys.map((k) => Id.decode(k));
	const blind = new BlindPeering(db.swarm.dht, db._store, {
		wakeup: new Wakeup(),
		keys: peerKeys
	});

	const cores = [];
	for (const name of names) {
		const entry = await db.getCore(name, { server: true, client: false });
		if (!entry) continue;
		await blind.addCore(entry.core, { announce: true });
		cores.push({ name, core: entry.core });
	}

	// A peer knows the core length the moment it connects (hypercore is
	// sparse) — remoteContiguousLength is what it has actually downloaded.
	// Only the blind peers count; any other swarm peer proves nothing about
	// mirror durability.
	const isBlind = (p) => peerKeys.some((k) => k.equals(p.remotePublicKey));
	const synced = (core) =>
		core.peers.some((p) => isBlind(p) && p.remoteContiguousLength >= core.length);
	const deadline = Date.now() + timeout;

	let pending = cores;
	while (pending.length > 0 && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		for (const { name, core } of pending) {
			if (synced(core)) console.log(`  ✓ blind peers have ${name} (${core.length} blocks)`);
		}
		pending = pending.filter(({ core }) => !synced(core));
	}
	for (const { name } of pending) console.log(`  ⚠ blind peers did not finish ${name} in time`);

	await blind.close();
	return pending.length === 0;
}

// ── ota manifest ──────────────────────────────────────────────────────────────

function keyOf(url) {
	return url.replace('git+pear://', '').split('/')[0].split('.').pop();
}

function updateSources(mirrored) {
	const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));
	const holepunch = sources.sources.find((s) => s.name === 'holepunch');

	let changed = false;
	for (const { name, url, description } of mirrored) {
		const existing = holepunch.repos.find((r) => r.name === name);
		if (!existing) {
			// Append-only: repos are added to the manifest, never removed.
			const entry = { name, url };
			if (description) entry.description = description;
			holepunch.repos.push(entry);
			changed = true;
			console.log(`  + manifest: ${name}`);
		} else if (existing.url !== url) {
			// The mirror is the source of truth for names it manages — refresh
			// the url (length hint bumps on every push; the key changes only if
			// the store was recreated, in which case the old url is dead).
			if (keyOf(existing.url) !== keyOf(url)) console.log(`  ~ manifest: ${name} rekeyed`);
			existing.url = url;
			changed = true;
		}
	}

	if (!changed) return false;
	holepunch.repos.sort((a, b) => a.name.localeCompare(b.name));
	writeFileSync(SOURCES_PATH, JSON.stringify(sources, null, '\t') + '\n');
	return true;
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
	const db = new GipLocalDB({ dir: STORE });
	await db.ready();

	const names = await db.getRepoNames();
	if (names.length === 0) {
		console.log('nothing to seed — run the mirror first');
		await db.close();
		return;
	}

	console.log(`seeding ${names.length} repos — public key ${Id.encode(await db.getPublicKey())}`);
	for (const name of names) {
		const entry = await db.getCore(name, { server: true, client: false });
		if (entry) console.log(`  ${name} — ${entry.core.length} blocks`);
	}

	// Blind peers only pull over connections we hold open — announcing on the
	// swarm alone never reaches them. Keep feeding them while seeding.
	const { blindPeers } = JSON.parse(readFileSync(SOURCES_PATH, 'utf8')).sources.find(
		(s) => s.name === 'holepunch'
	);
	if (blindPeers.length > 0) {
		console.log(`feeding ${blindPeers.length} blind peers`);
		pushToBlindPeers(db, names, blindPeers, { timeout: 24 * 60 * 60_000 }).catch((err) =>
			console.error(`  ⚠ blind peers: ${err.message}`)
		);
	}
	console.log('online until Ctrl-C');

	process.on('SIGINT', async () => {
		await db.close();
		process.exit(0);
	});
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	if (cmd.flags.seed) return seed();

	mkdirSync(CLONES, { recursive: true });

	console.log(
		REPOS ? `fetching ${REPOS.join(', ')}…` : `fetching top ${COUNT} ${ORG} repos by stars…`
	);
	const repos = (REPOS ? await namedRepos(REPOS) : await topRepos(COUNT)).filter((r) => {
		if (repoName.test(r.name)) return true;
		console.log(`  ~ ${r.name}: skipped (name not supported by gip)`);
		return false;
	});

	if (repos.length === 0) {
		console.log('nothing to mirror');
		process.exit(1);
	}

	// Create missing remotes and collect push urls, then release the store
	// before git takes it over.
	const state = readState(STATE);
	const inStore = new Set();
	const urls = await withStore(async (db) => {
		const names = await db.getRepoNames();
		for (const name of names) inStore.add(name);
		for (const repo of repos) {
			if (names.includes(repo.name)) continue;
			const remote = await db.createRemote(repo.name);
			console.log(`  + gip: ${repo.name} → ${remote.url.replace('0.0.', '')}`);
		}
		return repoUrls(
			db,
			repos.map((r) => r.name)
		);
	});
	console.log(`store ready — pushing ${repos.length} repos`);

	const mirrored = [];
	const failed = [];

	for (const repo of repos) {
		// Nothing landed on GitHub since the last successful run and the repo
		// is already in the store — no fetch, no pushes.
		if (
			state[repo.name] === repo.pushed_at &&
			inStore.has(repo.name) &&
			existsSync(join(CLONES, `${repo.name}.git`))
		) {
			console.log(`  – ${repo.name} (unchanged)`);
			mirrored.push(repo);
			continue;
		}

		try {
			const dir = ensureClone(repo);
			console.log(`  … ${repo.name}: pushing`);
			push(dir, urls.get(repo.name));
			console.log(`  ✓ ${repo.name} (★${repo.stargazers_count})`);
			mirrored.push(repo);
			state[repo.name] = repo.pushed_at;
		} catch (err) {
			failed.push(repo.name);
			const lines = err.message.split('\n').filter(Boolean);
			console.error(`  ✗ ${repo.name}: ${lines[0]}`);
			for (const line of lines.slice(-2)) if (line !== lines[0]) console.error(`      ${line}`);
		}
	}

	writeFileSync(STATE, JSON.stringify(state, null, '\t') + '\n');

	// Re-read for fresh urls — pushes bump the length embedded in each url —
	// and hand every mirrored core to the blind peers while the store is open.
	const blindPeers = JSON.parse(readFileSync(SOURCES_PATH, 'utf8')).sources.find(
		(s) => s.name === 'holepunch'
	).blindPeers;

	const fresh = await withStore(async (db) => {
		const urls = await repoUrls(
			db,
			mirrored.map((r) => r.name)
		);
		console.log(`pushing ${mirrored.length} repos to ${blindPeers.length} blind peers…`);
		await pushToBlindPeers(
			db,
			mirrored.map((r) => r.name),
			blindPeers
		);
		return urls;
	});

	for (const r of mirrored) {
		if (!fresh.has(r.name))
			throw new Error(`${r.name} pushed but missing from the store — was ${STORE} touched?`);
	}

	const manifestChanged =
		IS_DEFAULT_DIR &&
		updateSources(
			mirrored.map((r) => ({ name: r.name, url: fresh.get(r.name), description: r.description }))
		);
	if (!IS_DEFAULT_DIR) console.log('custom --dir — manifest untouched');

	if (manifestChanged) {
		run('node', [join(ROOT, 'scripts/ota.js')], { stdio: 'inherit' });
		console.log('\nmanifest updated — run `npm run ota -- --publish` to ship it OTA');
	}

	console.log(`\n${mirrored.length} mirrored, ${failed.length} failed`);
	// The swarm handles inside gip-transport keep the event loop alive for
	// minutes after close — exit explicitly, all work is flushed by now.
	process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
