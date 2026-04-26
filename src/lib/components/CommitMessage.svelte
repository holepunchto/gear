<script lang="ts" module>
	// Standard conventional-commit types mapped to a Tailwind color family.
	// Pattern: bg-{c}-500/15 + text-{c}-300 + ring-{c}-500/30 — the same
	// "soft pill on dark surface" treatment apricot already uses for
	// recent-activity highlights, so the type pills sit comfortably next to
	// existing UI without screaming.
	//
	// Choices intentionally re-use our brand palette where the semantics
	// match (feat → accent green for "new", fix → apricot for "attention,
	// not error", refactor → pear-adjacent teal for "internal cleanup")
	// and pull in tailwind defaults for the rest. We pre-write each class
	// string in full because Tailwind's JIT can only see complete class
	// names — string-interpolated families wouldn't survive the build.
	const TYPE_CLASSES: Record<string, string> = {
		feat: 'bg-accent-500/15 text-accent-300 ring-accent-500/30',
		fix: 'bg-apricot-500/15 text-apricot-300 ring-apricot-500/30',
		perf: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
		refactor: 'bg-teal-500/15 text-teal-300 ring-teal-500/30',
		docs: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
		style: 'bg-pink-500/15 text-pink-300 ring-pink-500/30',
		test: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
		build: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
		ci: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
		chore: 'bg-neutral-700/60 text-neutral-300 ring-neutral-600',
		revert: 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
	};
	const DEFAULT_TYPE_CLASS = 'bg-neutral-700/60 text-neutral-300 ring-neutral-600';

	function classesForType(type: string | null) {
		if (!type) return DEFAULT_TYPE_CLASS;
		return TYPE_CLASSES[type.toLowerCase()] ?? DEFAULT_TYPE_CLASS;
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
</script>

{#if variant === 'compact'}
	<span class="inline-flex min-w-0 items-center gap-1.5">
		{#if parsed.type}
			<span
				class="inline-flex shrink-0 items-center rounded px-1.5 py-px font-mono text-[10px] font-medium ring-1 {classesForType(
					parsed.type
				)}"
			>
				{parsed.type}{parsed.hasBreaking ? '!' : ''}
			</span>
		{/if}
		<span class="truncate" title={parsed.raw}>{display}</span>
	</span>
{:else if variant === 'inline'}
	<span class="inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
		{#if parsed.type}
			<span
				class="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide uppercase ring-1 {classesForType(
					parsed.type
				)}"
			>
				{parsed.type}{parsed.hasBreaking ? '!' : ''}
			</span>
		{/if}
		{#if parsed.scope}
			<span class="font-mono text-[11px] text-neutral-500">({parsed.scope})</span>
		{/if}
		<span class="min-w-0 truncate font-medium text-white" title={parsed.raw}>{display}</span>
	</span>
{:else}
	<!-- expanded -->
	<div class="min-w-0">
		{#if parsed.type || parsed.hasBreaking || parsed.scope}
			<div class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if parsed.type}
					<span
						class="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide uppercase ring-1 {classesForType(
							parsed.type
						)}"
					>
						{parsed.type}{parsed.hasBreaking ? '!' : ''}
					</span>
				{/if}
				{#if parsed.hasBreaking}
					<span
						class="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-red-300 uppercase ring-1 ring-red-500/30"
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
			{display}
		</div>
	</div>
{/if}
