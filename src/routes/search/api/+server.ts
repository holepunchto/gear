import { json } from '@sveltejs/kit';
import hid from 'hypercore-id-encoding';
import { getDB } from '$lib/server/gip';
import { getSearchPlugin } from '$lib/server/search';
import type { RequestHandler } from './$types';

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

function tokenizeQuery(text: string): string {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
		.join(' ');
}

function snippet(text: string, terms: string[], windowSize = 280): string {
	if (!text) return '';
	const lower = text.toLowerCase();
	let first = text.length;
	for (const term of terms) {
		const i = lower.indexOf(term.toLowerCase());
		if (i !== -1 && i < first) first = i;
	}
	const start = Math.max(0, first - 80);
	const end = Math.min(text.length, start + windowSize);
	return (start > 0 ? '…' : '') + text.slice(start, end).trimEnd() + (end < text.length ? '…' : '');
}

function timeout<T>(ms: number, fallback: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(fallback), ms));
}

async function fetchMeta(
	db: any,
	hex: string
): Promise<{ name: string; description: string; url: string }> {
	const fallback = { name: hex.slice(0, 12) + '…', description: '', url: '' };
	const keyBuf = Buffer.from(hex, 'hex');
	try {
		const result = await Promise.race([
			(async () => {
				const remote = await db._createRemote({ drive: { key: keyBuf } });
				const drive = await remote.toDrive('main');
				if (!drive) return null;
				const pkgBuf = await drive.get('/package.json');
				if (!pkgBuf) return null;
				const pkg = JSON.parse(pkgBuf.toString());
				const z32 = hid.normalize(keyBuf);
				return {
					name: pkg.name ?? hex.slice(0, 12) + '…',
					description: pkg.description ?? '',
					url: `git+pear://${z32}/${pkg.name}`
				};
			})(),
			timeout(8000, null)
		]);
		return result ?? fallback;
	} catch {
		return fallback;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const bootstrap = '127.0.0.1:62688';
	const nameIndexID = '25032ce809a1c133016b9853badbffb30a0e28f0d27c0d2d5751d45afc42f6a6';
	const fullIndexID = '0865d6c073d41e3299d0d08cc5ceff31edc92c909c9d9e08c6bbedd9c25cd8bd';

	if (!query) return json({ names: [], results: [] });

	const [{ plugin, ready }, db] = await Promise.all([getSearchPlugin(bootstrap), getDB()]);
	await ready;

	const fullQuery = tokenizeQuery(query);

	type RawResult = Record<
		string,
		{ keywords: Record<string, { positions: number[]; df: number }> }
	>;

	const [rawNames, rawFull] = await Promise.all([
		nameIndexID
			? plugin
					.keywordSearch(nameIndexID, 160, 'utf8')
					.prefixQuery(query)
					.catch(() => [])
			: Promise.resolve([]),
		fullIndexID && fullQuery
			? plugin
					.keywordSearch(fullIndexID, 160, 'utf8')
					.searchOr(fullQuery)
					.catch(() => ({}))
			: Promise.resolve({})
	]);

	const fullSearch = fullIndexID ? plugin.keywordSearch(fullIndexID, 160, 'utf8') : null;
	const ranked: { key: string; score: number }[] = fullSearch
		? fullSearch.rankTFIDFSat(Object.keys(rawFull as RawResult).length || 1, rawFull as RawResult)
		: Object.keys(rawFull as RawResult).map((key) => ({ key, score: 0 }));

	const results = await Promise.all(
		ranked.map(async ({ key: hex }) => {
			const { keywords } = (rawFull as RawResult)[hex];
			const matchedTerms = Object.keys(keywords);
			const positions = Object.values(keywords).flatMap((k) => k.positions);
			const inName = positions.some((p) => p < 100_000);
			const inDescription = positions.some((p) => p >= 100_000 && p < 200_000);
			const inReadme = positions.some((p) => p >= 200_000);

			const { name, description, url } = await fetchMeta(db, hex);

			return {
				hex,
				url,
				name,
				matchedTerms,
				inName,
				inDescription,
				inReadme,
				descriptionSnippet: snippet(description, matchedTerms)
			};
		})
	);

	const resultNames = new Set(results.map((r) => r.name));
	const names = ((rawNames as string[]) ?? []).filter((n) => !resultNames.has(n));

	return json({ names, results });
};
