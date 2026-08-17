<script lang="ts">
	import type { ParsedCommit } from '$lib/server/commit-parse';

	let { parsed }: { parsed: ParsedCommit } = $props();
</script>

{#if parsed.body}
	<pre
		class="m-0 font-mono text-[12px] leading-snug whitespace-pre-wrap text-neutral-300">{parsed.body}</pre>
{/if}

{#each parsed.notes as note}
	<div
		class="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[12px] text-red-200"
	>
		<div class="font-semibold tracking-wide text-red-300 uppercase">{note.title}</div>
		<div class="mt-0.5 whitespace-pre-wrap text-red-100/90">{note.text}</div>
	</div>
{/each}

{#if parsed.references.length}
	<div class="flex flex-wrap gap-1.5">
		{#each parsed.references as ref}
			<span
				class="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[11px] text-sky-300 ring-1 ring-sky-500/25"
				title={ref.action ? `${ref.action} ${ref.raw}` : ref.raw}
			>
				{#if ref.action}
					<span class="text-sky-400/70">{ref.action}</span>
				{/if}
				<span>{ref.prefix ?? '#'}{ref.issue ?? ref.raw}</span>
			</span>
		{/each}
	</div>
{/if}

{#if parsed.mentions.length}
	<div class="flex flex-wrap gap-1.5">
		{#each parsed.mentions as m}
			<span
				class="inline-flex items-center rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[11px] text-violet-300 ring-1 ring-violet-500/25"
			>
				@{m}
			</span>
		{/each}
	</div>
{/if}

{#if parsed.footer}
	<pre
		class="m-0 font-mono text-[11.5px] leading-snug whitespace-pre-wrap text-neutral-500">{parsed.footer}</pre>
{/if}
