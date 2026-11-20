<script lang="ts">
	import CommitMessage from '$lib/components/CommitMessage.svelte';
	import { relativeTime, isoDate } from '$lib/time';
	import type { Changes } from '$lib/releases';

	// A release's commits, newest first, each linking to its commit page.
	let { changes, compact = false }: { changes: Changes; compact?: boolean } = $props();
</script>

<ul class="m-0 flex list-none flex-col p-0">
	{#each changes.commits as c (c.oid)}
		<li class="min-w-0 border-b border-white/4 last:border-b-0">
			<a
				href="/{changes.repo}/commit/{c.oid}"
				class="flex min-w-0 items-baseline gap-3 text-[13px] text-fg no-underline hover:text-accent-300 {compact
					? 'py-1.5'
					: 'py-2.5'}"
			>
				<span class="min-w-0 flex-1 truncate">
					<CommitMessage parsed={c.message} variant="compact" />
				</span>
				{#if !compact}
					<span class="hidden shrink-0 truncate text-xs text-fg-3 sm:inline">
						{c.author ?? 'unknown'}
					</span>
					<span class="shrink-0 text-xs text-fg-3" title={isoDate(c.timestamp)}>
						{relativeTime(c.timestamp)}
					</span>
				{/if}
				<span class="shrink-0 font-mono text-xs text-fg-3">{c.oid.slice(0, 7)}</span>
			</a>
		</li>
	{/each}
</ul>
