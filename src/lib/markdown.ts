import { marked, type Tokens } from 'marked';

export type Alert = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export type Segment =
	| { kind: 'markdown' | 'html'; source: string }
	| { kind: 'alert'; alert: Alert; source: string };

// GitHub's alerts: a blockquote whose first line is [!NOTE], [!WARNING]…
const ALERT = /^\s*\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

// The markdown renderer mangles nested HTML (an <h1> wrapping a <picture>
// comes out as the text "<h1>"), so block-level HTML is split out and
// rendered on its own. Link definitions go with every markdown run, so a
// reference link still resolves on either side of an HTML block.
export function segments(source: string): Segment[] {
	const tokens = marked.lexer(source);
	const defs = Object.entries(tokens.links ?? {})
		.map(([label, { href, title }]) => `[${label}]: <${href}>${title ? ` "${title}"` : ''}`)
		.join('\n');

	const out: Segment[] = [];
	let run = '';
	const flush = () => {
		if (run.trim()) out.push({ kind: 'markdown', source: defs ? `${run}\n\n${defs}\n` : run });
		run = '';
	};

	for (const token of tokens) {
		const quote = token.type === 'blockquote' ? (token as Tokens.Blockquote).text : null;
		const alert = quote === null ? null : ALERT.exec(quote);
		if (quote !== null && alert) {
			flush();
			const body = quote.slice(alert[0].length);
			out.push({
				kind: 'alert',
				alert: alert[1].toLowerCase() as Alert,
				source: defs ? `${body}\n\n${defs}\n` : body
			});
		} else if (token.type === 'html' && token.block) {
			flush();
			out.push({ kind: 'html', source: token.raw });
		} else {
			run += token.raw;
		}
	}
	flush();
	return out;
}

// Where a README's relative paths point: its files are served raw, and a
// link opens the file view. `dir` is the README's folder, '' at the root.
export type Base = { repo: string; ref: string; dir: string };

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:|^\/\/|^#/i;

function resolve(base: Base, url: string, prefix: string) {
	const dir = base.dir.replace(/^\/+|\/+$/g, '');
	const path = new URL(url, `http://x/${dir ? dir + '/' : ''}`).pathname;
	return `${prefix}/${base.repo}/${base.ref}${path}`;
}

// An image or <source> path: absolute URLs stay, relative ones load from the
// repo. Anything that isn't http(s) or relative is dropped.
export function assetUrl(base: Base, url: string) {
	if (/^https?:\/\//i.test(url)) return url;
	if (ABSOLUTE.test(url)) return null;
	return resolve(base, url, '/api/raw') + '?inline';
}

export function srcset(base: Base, value: string) {
	const parts = value.split(',').map((part) => {
		const [url, ...rest] = part.trim().split(/\s+/);
		const resolved = assetUrl(base, url);
		return resolved && [resolved, ...rest].join(' ');
	});
	return parts.every(Boolean) ? parts.join(', ') : null;
}

// A link: web, mail and in-page links stay, relative ones open the file view.
export function linkUrl(base: Base, url: string) {
	if (/^(https?:|mailto:|#)/i.test(url)) return url;
	if (ABSOLUTE.test(url)) return null;
	return resolve(base, url, '');
}

// What a README's HTML may contain. READMEs come from any peer, and the page
// can post the app's own forms, so no forms, buttons, scripts, frames, styles
// or event handlers. Anything else renders its children.
export const ALLOWED_TAGS = new Set([
	'a',
	'abbr',
	'b',
	'blockquote',
	'br',
	'code',
	'dd',
	'del',
	'details',
	'div',
	'dl',
	'dt',
	'em',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'i',
	'img',
	'ins',
	'kbd',
	'li',
	'ol',
	'p',
	'picture',
	'pre',
	'q',
	's',
	'samp',
	'small',
	'source',
	'span',
	'strong',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'u',
	'ul'
]);

// Dropped with everything inside them.
export const DROPPED_TAGS = new Set([
	'script',
	'style',
	'iframe',
	'object',
	'embed',
	'form',
	'input',
	'button',
	'select',
	'textarea',
	'template',
	'noscript',
	'svg',
	'math',
	'link',
	'meta',
	'base'
]);

export const VOID_TAGS = new Set(['br', 'hr', 'img', 'source']);
