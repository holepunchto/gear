import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import createTestnet from 'hyperdht/testnet.js';
import { GitPearLink } from 'gip-remote';
const { default: Hypersearch } = await import('hypersearch');

// Persist publisher seed so indexIDs are stable across restarts
const SEED_FILE = new URL('./bootstrap-seed.bin', import.meta.url).pathname;
function loadOrCreateSeed() {
	if (fs.existsSync(SEED_FILE)) return fs.readFileSync(SEED_FILE);
	const seed = randomBytes(32);
	fs.writeFileSync(SEED_FILE, seed);
	return seed;
}

const REPOS_DIR = '/Users/odinsson/Dev/pear/gip-demo-repos';

const FIELD_BASE = { name: 0, description: 100_000, readme: 200_000 };

const STOP_WORDS = new Set([
	'the',
	'and',
	'for',
	'are',
	'but',
	'not',
	'you',
	'all',
	'can',
	'had',
	'her',
	'was',
	'one',
	'our',
	'out',
	'day',
	'get',
	'has',
	'him',
	'his',
	'how',
	'its',
	'now',
	'may',
	'new',
	'see',
	'two',
	'use',
	'way',
	'who',
	'with',
	'this',
	'that',
	'from',
	'have',
	'they',
	'will',
	'been',
	'more',
	'when',
	'also',
	'into',
	'than',
	'then',
	'some',
	'what',
	'your',
	'each',
	'over',
	'such',
	'used',
	'any',
	'via'
]);

function getGipUrl(repoDir) {
	const configPath = path.join(repoDir, '.git', 'config');
	if (!fs.existsSync(configPath)) return null;
	const config = fs.readFileSync(configPath, 'utf8');
	const match = config.match(/\[remote "gip"\][^\[]*?\burl\s*=\s*(.+)/s);
	return match ? match[1].split('\n')[0].trim() : null;
}

function loadRepos() {
	return fs
		.readdirSync(REPOS_DIR)
		.map((dir) => {
			const base = path.join(REPOS_DIR, dir);
			const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
			const readmePath = path.join(base, 'README.md');
			const url = getGipUrl(base);
			if (!url) return null;
			return {
				name: pkg.name || dir,
				description: pkg.description || '',
				readme: fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '',
				url
			};
		})
		.filter(Boolean);
}

function tokenizeField(text, field) {
	const base = FIELD_BASE[field];
	const tokens = [];
	let pos = 0;
	for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
		if (word.length >= 3 && !STOP_WORDS.has(word)) {
			tokens.push({ term: word, position: base + pos });
			pos++;
		}
	}
	return tokens;
}

function repoKey(url) {
	return GitPearLink.parse(url).drive.key;
}

async function main() {
	const repos = loadRepos();
	console.log(`Loaded ${repos.length} repos: ${repos.map((r) => r.name).join(', ')}\n`);

	const testnet = await createTestnet(10, { host: '192.168.178.118' });
	const { host, port } = testnet.bootstrap[0];
	console.log(`Bootstrap: ${host}:${port}\n`);

	// Publisher uses a fixed seed so its keyPair (and therefore indexIDs) are stable across restarts
	const seed = loadOrCreateSeed();
	const [publisher, ...rest] = await Promise.all(
		testnet.nodes.map(async (node, i) => {
			const plugin = new Hypersearch(i === 0 ? { seed } : {});
			node.register(plugin.name, plugin);
			await plugin.listen();
			return plugin;
		})
	);

	// ── Index 1: repo names → autocomplete via prefixQuery ───────────────────
	const nameVocab = repos.map((r) => r.name);
	console.log(`Publishing name index (${nameVocab.length} terms)...`);
	const nameIndexID = await publisher.publishKeywordIndex(nameVocab, 'repo-names', 160, 'utf8', 4);

	const nameSearch = rest[0].keywordSearch(nameIndexID, 160, 'utf8');
	for (const repo of repos) {
		await nameSearch.putRecords(repo.name, [{ key: repoKey(repo.url), positions: [0] }]);
	}
	console.log(`Name index ID: ${nameIndexID}\n`);

	// ── Index 2: full-text (name + description + readme) → searchOr ──────────
	const tokenMap = new Map();
	for (const repo of repos) {
		for (const field of ['name', 'description', 'readme']) {
			for (const { term, position } of tokenizeField(repo[field], field)) {
				if (!tokenMap.has(term)) tokenMap.set(term, new Map());
				const repoPos = tokenMap.get(term);
				if (!repoPos.has(repo.url)) repoPos.set(repo.url, []);
				repoPos.get(repo.url).push(position);
			}
		}
	}

	const fullVocab = [...tokenMap.keys()];
	console.log(`Publishing full-text index (${fullVocab.length} unique tokens)...`);
	const fullIndexID = await publisher.publishKeywordIndex(
		fullVocab,
		'repo-fulltext',
		160,
		'utf8',
		4
	);

	const fullSearch = rest[1].keywordSearch(fullIndexID, 160, 'utf8');
	for (const [term, repoPositions] of tokenMap) {
		const postings = [...repoPositions.entries()].map(([url, positions]) => ({
			key: repoKey(url),
			positions
		}));
		await fullSearch.putRecords(term, postings);
	}
	console.log(`Full-text index ID: ${fullIndexID}\n`);

	console.log('Repos:');
	for (const repo of repos) {
		console.log(`  ${repo.name}  ${repo.url}`);
	}

	console.log('\nReady. Ctrl+C to stop.\n');
}

main();
