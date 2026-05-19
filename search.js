import fs from 'fs';
import path from 'path';
import sodium from 'sodium-universal';
import b4a from 'b4a';
import createTestnet from 'hyperdht/testnet.js';
const { default: Hypersearch } = await import('hypersearch');

const REPOS_DIR = '/Users/odinsson/Dev/pear/gip-demo-repos';

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

function loadRepos() {
	const names = fs.readdirSync(REPOS_DIR);
	return names.map((name) => {
		const dir = path.join(REPOS_DIR, name);
		const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
		const readmePath = path.join(dir, 'README.md');
		const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
		return {
			name: pkg.name || name,
			description: pkg.description || '',
			readme
		};
	});
}

// Returns [{term, position}] for a body of text
function tokenize(text) {
	const tokens = [];
	const words = text.toLowerCase().split(/[^a-z0-9]+/);
	let position = 0;
	for (const word of words) {
		if (word.length >= 3 && !STOP_WORDS.has(word)) {
			tokens.push({ term: word, position });
			position++;
		}
	}
	return tokens;
}

// Stable 32-byte key for a repo derived from its name
function repoKey(repoName) {
	const hash = b4a.alloc(32);
	sodium.crypto_generichash(hash, b4a.from(repoName, 'utf8'));
	return hash;
}

// Map hex key → repo name for display
function buildKeyIndex(repos) {
	const index = new Map();
	for (const repo of repos) {
		index.set(b4a.toString(repoKey(repo.name), 'hex'), repo.name);
	}
	return index;
}

async function main() {
	const repos = loadRepos();
	const keyIndex = buildKeyIndex(repos);
	console.log(`Loaded ${repos.length} repos: ${repos.map((r) => r.name).join(', ')}\n`);

	const testnet = await createTestnet(10, {});
	const [bob, alice, charlie] = await Promise.all(
		testnet.nodes.map(async (node) => {
			const plugin = new Hypersearch();
			node.register(plugin.name, plugin);
			await plugin.listen();
			return plugin;
		})
	);

	// ── Index 1: repo names → autocomplete via prefixQuery ──────────────────
	const nameVocab = repos.map((r) => r.name);
	console.log(`Publishing name index (${nameVocab.length} terms)...`);
	const nameIndexID = await bob.publishKeywordIndex(nameVocab, 'repo-names', 160, 'utf8', 4);
	console.log(`Name index ID: ${nameIndexID}`);

	const nameWriter = alice.keywordSearch(nameIndexID, 160, 'utf8');
	for (const repo of repos) {
		await nameWriter.putRecords(repo.name, [{ key: repoKey(repo.name), positions: [0] }]);
	}
	console.log('Name index populated.\n');

	// ── Index 2: full-text (name + description + readme) → search ───────────
	// tokenMap: term → Map<repoName, positions[]>
	const tokenMap = new Map();

	for (const repo of repos) {
		const text = [repo.name, repo.description, repo.readme].join(' ');
		const tokens = tokenize(text);
		for (const { term, position } of tokens) {
			if (!tokenMap.has(term)) tokenMap.set(term, new Map());
			const repoPositions = tokenMap.get(term);
			if (!repoPositions.has(repo.name)) repoPositions.set(repo.name, []);
			repoPositions.get(repo.name).push(position);
		}
	}

	const fullVocab = [...tokenMap.keys()];
	console.log(`Publishing full-text index (${fullVocab.length} unique tokens)...`);
	const fullIndexID = await bob.publishKeywordIndex(fullVocab, 'repo-fulltext', 160, 'utf8', 4);
	console.log(`Full-text index ID: ${fullIndexID}`);

	const fullWriter = alice.keywordSearch(fullIndexID, 160, 'utf8');
	for (const [term, repoPositions] of tokenMap) {
		const postings = [...repoPositions.entries()].map(([name, positions]) => ({
			key: repoKey(name),
			positions
		}));
		await fullWriter.putRecords(term, postings);
	}
	console.log('Full-text index populated.\n');

	// ── Queries ──────────────────────────────────────────────────────────────
	const nameReader = charlie.keywordSearch(nameIndexID, 160, 'utf8');
	const fullReader = charlie.keywordSearch(fullIndexID, 160, 'utf8');

	// Autocomplete
	for (const prefix of ['hyper', 'p', 'b']) {
		const results = await nameReader.prefixQuery(prefix);
		console.log(`Autocomplete "${prefix}":`, results);
	}

	// Full-text search
	console.log('');
	for (const query of ['networking peers', 'buffer typed array', 'parameter']) {
		const results = await fullReader.searchOr(query);
		const matched = Object.keys(results).map((hex) => keyIndex.get(hex) ?? hex);
		console.log(`searchOr "${query}": [${matched.join(', ')}]`);
	}

	console.log('\nCleaning up...');
	const closing = [];
	for (const node of testnet.nodes) closing.push(node.destroy());
	await Promise.all(closing);
	console.log('Done!');
}

main();
