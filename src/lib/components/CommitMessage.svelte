<script lang="ts" module>
	// Standard conventional-commit types mapped to a Tailwind color family.
	// Pattern: bg-{c}/12 + text-{c}-300, no ring — a quiet tint on the
	// surface, so the type reads without the chip shouting over the subject.
	//
	// Choices intentionally re-use our brand palette where the semantics
	// match (feat → accent green for "new", fix → apricot for "attention,
	// not error", refactor → pear-adjacent teal for "internal cleanup")
	// and pull in tailwind defaults for the rest. We pre-write each class
	// string in full because Tailwind's JIT can only see complete class
	// names — string-interpolated families wouldn't survive the build.
	const TYPE_CLASSES: Record<string, string> = {
		feat: 'bg-accent-400/12 text-accent-300',
		fix: 'bg-apricot-400/12 text-apricot-300',
		perf: 'bg-amber-400/12 text-amber-300',
		refactor: 'bg-teal-400/12 text-teal-300',
		docs: 'bg-sky-400/12 text-sky-300',
		style: 'bg-pink-400/12 text-pink-300',
		test: 'bg-violet-400/12 text-violet-300',
		build: 'bg-white/6 text-fg-2',
		ci: 'bg-white/6 text-fg-2',
		chore: 'bg-white/6 text-fg-2',
		revert: 'bg-rose-400/12 text-rose-300'
	};
	const DEFAULT_TYPE_CLASS = 'bg-white/6 text-fg-2';

	function classesForType(type: string | null) {
		if (!type) return DEFAULT_TYPE_CLASS;
		return TYPE_CLASSES[type.toLowerCase()] ?? DEFAULT_TYPE_CLASS;
	}

	// `#23` issue/PR refs: a standalone token (start, space or opening bracket
	// before it, no word character after), so URL fragments and hex colours
	// stay plain. Same pattern and colour as refs in <CommitBody>.
	const REF_RE = /(?<![^\s([])#\d+(?!\w)/g;

	function splitRefs(text: string) {
		const out: { text: string; ref: boolean }[] = [];
		let last = 0;
		for (const m of text.matchAll(REF_RE)) {
			if (m.index > last) out.push({ text: text.slice(last, m.index), ref: false });
			out.push({ text: m[0], ref: true });
			last = m.index + m[0].length;
		}
		if (last < text.length) out.push({ text: text.slice(last), ref: false });
		return out;
	}
</script>

<script lang="ts">
	import type { ParsedCommit } from '$lib/server/commit-parse';

	let {
		parsed,
		variant = 'expanded'
	}: {
		parsed: ParsedCommit;
		/**
		 * - `compact`: single inline row, type pill + truncated subject. For
		 *   the file-tree per-row use.
		 * - `inline`:  same row but with scope shown — for the layout banner.
		 * - `expanded`: type + breaking + scope as a top row, subject as a
		 *   bold heading underneath. For the /commits list.
		 */
		variant?: 'compact' | 'inline' | 'expanded';
	} = $props();

	const display = $derived(parsed.subject || parsed.header || '(no message)');
	const parts = $derived(splitRefs(display));
</script>

{#snippet subject()}{#each parts as p}{#if p.ref}<span class="text-sky-300">{p.text}</span
			>{:else}{p.text}{/if}{/each}{/snippet}

{#if variant === 'compact'}
	<span class="inline-flex min-w-0 items-center gap-1.5">
		{#if parsed.type}
			<span
				class="inline-flex shrink-0 items-center rounded-md px-[7px] py-px font-mono text-[11px] font-medium {classesForType(
					parsed.type
				)}"
			>
				{parsed.type}{parsed.hasBreaking ? '!' : ''}
			</span>
		{/if}
		<span class="truncate" title={parsed.raw}>{@render subject()}</span>
	</span>
{:else if variant === 'inline'}
	<span class="inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
		{#if parsed.type}
			<span
				class="inline-flex shrink-0 items-center rounded-md px-[7px] py-px font-mono text-[11px] font-medium {classesForType(
					parsed.type
				)}"
			>
				{parsed.type}{parsed.hasBreaking ? '!' : ''}
			</span>
		{/if}
		{#if parsed.scope}
			<span class="font-mono text-[11px] text-neutral-500">({parsed.scope})</span>
		{/if}
		<span class="min-w-0 truncate font-medium text-white" title={parsed.raw}
			>{@render subject()}</span
		>
	</span>
{:else}
	<!-- expanded -->
	<div class="min-w-0">
		{#if parsed.type || parsed.hasBreaking || parsed.scope}
			<div class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if parsed.type}
					<span
						class="inline-flex items-center rounded-md px-[7px] py-px font-mono text-[11px] font-medium {classesForType(
							parsed.type
						)}"
					>
						{parsed.type}{parsed.hasBreaking ? '!' : ''}
					</span>
				{/if}
				{#if parsed.hasBreaking}
					<span
						class="inline-flex items-center gap-1 rounded-md bg-red-400/12 px-[7px] py-px font-mono text-[11px] font-medium text-red-300"
						title="Breaking change"
					>
						<svg
							width="9"
							height="9"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M12 9v4" />
							<path d="M12 17h.01" />
							<path
								d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
							/>
						</svg>
						breaking
					</span>
				{/if}
				{#if parsed.scope}
					<span class="font-mono text-[12px] text-neutral-500">({parsed.scope})</span>
				{/if}
			</div>
		{/if}
		<div class="text-[14px] font-semibold break-words text-white">
			{@render subject()}
		</div>
	</div>
{/if}
