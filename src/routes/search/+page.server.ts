import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fail } from '@sveltejs/kit';
import sodium from 'sodium-universal';
import b4a from 'b4a';
import { getSearchPlugin } from '$lib/server/search';
import type { Actions, PageServerLoad } from './$types';

const REPOS_DIR = '/Users/odinsson/Dev/pear/gip-demo-repos';

function repoHex(name: string): string {
	const hash = b4a.alloc(32);
	sodium.crypto_generichash(hash, b4a.from(name, 'utf8'));
	return b4a.toString(hash, 'hex');
}

interface RepoData {
	name: string;
	description: string;
	readme: string;
}

const g = globalThis as Record<string, unknown>;

function getRepoIndex(): Map<string, RepoData> {
	if (!g.__repoIndex) {
		const index = new Map<string, RepoData>();
		for (const dir of readdirSync(REPOS_DIR)) {
			const base = join(REPOS_DIR, dir);
			const pkg = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
			const readmePath = join(base, 'README.md');
			const name: string = pkg.name || dir;
			index.set(repoHex(name), {
				name,
				description: pkg.description || '',
				readme: existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '',
			});
		}
		g.__repoIndex = index;
	}
	return g.__repoIndex as Map<string, RepoData>;
}

// Extract a window of text around the first matching term.
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
	const prefix = start > 0 ? '…' : '';
	const suffix = end < text.length ? '…' : '';
	return prefix + text.slice(start, end).trimEnd() + suffix;
}

export const load: PageServerLoad = () => ({});

export const actions: Actions = {
	search: async ({ request }: { request: Request }) => {
		const fd = await request.formData();
		const bootstrap = (fd.get('bootstrap') as string | null)?.trim() ?? '';
		const nameIndexID = (fd.get('nameIndexID') as string | null)?.trim() ?? '';
		const fullIndexID = (fd.get('fullIndexID') as string | null)?.trim() ?? '';
		const query = (fd.get('query') as string | null)?.trim() ?? '';

		if (!bootstrap || !query) {
			return fail(400, { error: 'Bootstrap and query are required' });
		}

		const { plugin, ready } = await getSearchPlugin(bootstrap);
		await ready;

		const repoIndex = getRepoIndex();

		// Run autocomplete and full-text in parallel
		const [names, rawFull] = await Promise.all([
			nameIndexID
				? plugin.keywordSearch(nameIndexID, 160, 'utf8').prefixQuery(query).catch(() => [])
				: Promise.resolve([]),
			fullIndexID
				? plugin.keywordSearch(fullIndexID, 160, 'utf8').searchOr(query).catch(() => ({}))
				: Promise.resolve({}),
		]);

		type RawResult = Record<string, { keywords: Record<string, { positions: number[]; df: number }> }>;

		const results = Object.entries(rawFull as RawResult).map(([hex, { keywords }]) => {
			const repo = repoIndex.get(hex);
			const matchedTerms = Object.keys(keywords);
			const positions = Object.values(keywords).flatMap((k) => k.positions);
			const inDescription = positions.some((p) => p >= 100_000 && p < 200_000);
			const inReadme = positions.some((p) => p >= 200_000);
			return {
				hex,
				name: repo?.name ?? hex.slice(0, 12) + '…',
				matchedTerms,
				inName: positions.some((p) => p < 100_000),
				inDescription,
				inReadme,
				descriptionSnippet: snippet(repo?.description ?? '', matchedTerms),
				readmeSnippet: inReadme ? snippet(repo?.readme ?? '', matchedTerms) : '',
			};
		});

		return { query, names: (names as string[]) ?? [], results };
	},
};
