<script lang="ts">
	import type { ParsedCommit } from '$lib/server/commit-parse';

	let { parsed }: { parsed: ParsedCommit } = $props();

	// Anything worth surfacing past the subject — body paragraphs, footer
	// trailers (Co-Authored-By, Signed-off-by), structured notes, issue
	// refs, @-mentions. Hide the whole thing when there's nothing to show
	// so the parent doesn't render an empty disclosure widget.
	const hasAnything = $derived(
		!!parsed.body ||
			!!parsed.footer ||
			parsed.notes.length > 0 ||
			parsed.references.length > 0 ||
			parsed.mentions.length > 0
	);
</script>

{#if hasAnything}
	<details class="mt-2 text-[12.5px] text-neutral-400">
		<summary
			class="inline-flex cursor-pointer list-none items-center gap-1 text-neutral-500 hover:text-neutral-300"
		>
			<svg
				width="11"
				height="11"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="transition-transform [details[open]_&]:rotate-90"
				aria-hidden="true"
			>
				<path d="m9 18 6-6-6-6" />
			</svg>
			<span class="select-none">Show more</span>
		</summary>
		<div class="mt-2 space-y-3 border-l-2 border-neutral-800 pl-3">
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
		</div>
	</details>
{/if}
