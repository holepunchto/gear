import { json } from '@sveltejs/kit';
import { getSearchPlugin } from '$lib/server/search';
import hid from 'hypercore-id-encoding';
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


export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const bootstrap = '192.168.178.118:49741';
	const nameIndexID = '25032ce809a1c133016b9853badbffb30a0e28f0d27c0d2d5751d45afc42f6a6';
	const fullIndexID = '0865d6c073d41e3299d0d08cc5ceff31edc92c909c9d9e08c6bbedd9c25cd8bd';

	if (!query) return json({ names: [], results: [] });

	const [{ plugin, ready }] = await Promise.all([getSearchPlugin(bootstrap)]);
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

	const fullResults = ranked.map(({ key: hex }) => {
		const { keywords } = (rawFull as RawResult)[hex];
		const matchedTerms = Object.keys(keywords);
		const positions = Object.values(keywords).flatMap((k) => k.positions);
		return {
			hex,
			matchedTerms,
			inName: positions.some((p) => p < 100_000),
			inDescription: positions.some((p) => p >= 100_000 && p < 200_000),
			inReadme: positions.some((p) => p >= 200_000)
		};
	});

	// searchOr on the nameIndex resolves each prefix-matched name to its hex (document key).
	// This works for all network repos, not just locally synced ones.
	const nameSearch = plugin.keywordSearch(nameIndexID, 160, 'utf8');
	const fullHexSet = new Set(fullResults.map((r) => r.hex));
	const nameResults = (
		await Promise.all(
			(rawNames as string[]).map(async (name: string) => {
				try {
					const res: Record<string, unknown> = await nameSearch.searchOr(name).catch(() => ({}));
					return Object.keys(res)
						.filter((hex) => !fullHexSet.has(hex))
						.map((hex) => {
							const z32 = hid.normalize(Buffer.from(hex, 'hex'));
							return {
								hex,
								name,
								repoUrl: `git+pear://${z32}/${name}`,
								matchedTerms: [name],
								inName: true,
								inDescription: false,
								inReadme: false
							};
						});
				} catch {
					return [];
				}
			})
		)
	).flat();

	const results = [...nameResults, ...fullResults];

	return json({ names: (rawNames as string[]) ?? [], results });
};
