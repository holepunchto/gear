<script lang="ts" module>
	// Inline text colors per conventional-commit type — the text half of the
	// pill palette in <CommitMessage>, for highlighting `feat:` prefixes that
	// appear inside squash-merge bodies.
	const TYPE_TEXT: Record<string, string> = {
		feat: 'text-accent-300',
		fix: 'text-apricot-300',
		perf: 'text-amber-300',
		refactor: 'text-teal-300',
		docs: 'text-sky-300',
		style: 'text-pink-300',
		test: 'text-violet-300',
		build: 'text-slate-300',
		ci: 'text-slate-300',
		chore: 'text-neutral-400',
		revert: 'text-rose-300'
	};

	type Seg = { text: string; cls?: string };

	// Issue refs, standalone @mentions (the lookbehind keeps the @ inside
	// email addresses plain) and breaking-change markers.
	const INLINE_RE = /(?<![\w.@-])(@[a-zA-Z0-9-]+)|(#\d+)|(BREAKING[ -]CHANGE)/g;
	// `Key-With-Hyphens:` trailer lines (Co-Authored-By, Signed-off-by).
	const TRAILER_RE = /^[A-Z][A-Za-z]*(?:-[A-Za-z]+)+:/;
	// `feat(scope)!:` style prefix at the start of a line.
	const TYPE_RE = /^([a-z][\w-]*)((?:\([^)]+\))?!?:)/;
	// `* ` / `- ` list markers, with indentation.
	const BULLET_RE = /^(\s*)[-*] /;

	function inline(text: string, base?: string): Seg[] {
		const out: Seg[] = [];
		let last = 0;
		for (const m of text.matchAll(INLINE_RE)) {
			if (m.index > last) out.push({ text: text.slice(last, m.index), cls: base });
			out.push({
				text: m[0],
				cls: m[1] ? 'text-violet-300' : m[2] ? 'text-sky-300' : 'font-semibold text-red-300'
			});
			last = m.index + m[0].length;
		}
		if (last < text.length) out.push({ text: text.slice(last), cls: base });
		return out;
	}

	function segments(body: string): Seg[] {
		const out: Seg[] = [];
		for (const line of body.split('\n')) {
			let rest = line;
			const bullet = rest.match(BULLET_RE);
			if (bullet) {
				out.push({ text: `${bullet[1]}• `, cls: 'text-neutral-600' });
				rest = rest.slice(bullet[0].length);
			}
			const typed = rest.match(TYPE_RE);
			if (TRAILER_RE.test(rest)) {
				out.push(...inline(rest, 'text-neutral-500'));
			} else if (typed && TYPE_TEXT[typed[1]]) {
				out.push({ text: typed[0], cls: TYPE_TEXT[typed[1]] });
				out.push(...inline(rest.slice(typed[0].length)));
			} else {
				out.push(...inline(rest));
			}
			out.push({ text: '\n' });
		}
		out.pop();
		return out;
	}
</script>

<script lang="ts">
	import type { ParsedCommit } from '$lib/server/commit-parse';

	let { parsed }: { parsed: ParsedCommit } = $props();

	const segs = $derived(parsed.body ? segments(parsed.body) : []);
</script>

{#if parsed.body}
	<pre
		class="m-0 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-neutral-300">{#each segs as s}{#if s.cls}<span
				class={s.cls}>{s.text}</span
			>{:else}{s.text}{/if}{/each}</pre>
{/if}
