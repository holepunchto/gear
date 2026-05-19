import { json } from '@sveltejs/kit';
import { getDB } from '$lib/server/gip';
import type { RequestHandler } from './$types';

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

export const GET: RequestHandler = async ({ url }) => {
	const repoUrl = url.searchParams.get('url')?.trim() ?? '';
	const termsParam = url.searchParams.get('terms')?.trim() ?? '';

	if (!repoUrl) return json({ readme: '' });

	const terms = termsParam ? termsParam.split(',').filter(Boolean) : [];

	try {
		const db = await getDB();
		const text = await Promise.race([
			(async () => {
				const remote = await (db as any)._createRemote(repoUrl);
				const drive = await remote.toDrive('main');
				if (!drive) return null;
				const buf = await drive.get('/README.md');
				return buf ? buf.toString() : null;
			})(),
			timeout(8000, null),
		]);
		if (!text) return json({ readme: '' });
		return json({ readme: snippet(text, terms) });
	} catch {
		return json({ readme: '' });
	}
};
