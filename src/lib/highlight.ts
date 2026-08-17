import hljs from 'highlight.js/lib/core';

import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('makefile', makefile);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);

const byBasename: Record<string, string> = {
	makefile: 'makefile',
	dockerfile: 'dockerfile'
};

const byExtension: Record<string, string> = {
	svelte: 'xml',
	vue: 'xml',
	zsh: 'bash'
};

export function languageFor(filename: string): string | null {
	const base = filename.toLowerCase();
	if (byBasename[base]) return byBasename[base];
	const ext = base.slice(base.lastIndexOf('.') + 1);
	const lang = byExtension[ext] ?? ext;
	return hljs.getLanguage(lang) ? lang : null;
}

export function highlight(code: string, lang: string | null): string | null {
	if (!lang || !hljs.getLanguage(lang)) return null;
	return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
}

function escape(code: string): string {
	return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Per-line HTML for the source view. Spans that cross a newline are closed at
// the end of the line and reopened on the next, so each line stands alone.
export function highlightLines(code: string, lang: string | null): string[] {
	const html = highlight(code, lang) ?? escape(code);
	const lines: string[] = [];
	const open: string[] = [];
	let cur = '';
	let last = 0;
	const tokens = /<span[^>]*>|<\/span>|\n/g;
	let m;
	while ((m = tokens.exec(html))) {
		cur += html.slice(last, m.index);
		last = m.index + m[0].length;
		if (m[0] === '\n') {
			lines.push(cur + '</span>'.repeat(open.length));
			cur = open.join('');
		} else {
			if (m[0] === '</span>') open.pop();
			else open.push(m[0]);
			cur += m[0];
		}
	}
	lines.push(cur + html.slice(last));
	return lines;
}
