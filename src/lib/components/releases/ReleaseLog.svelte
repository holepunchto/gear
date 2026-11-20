<script lang="ts">
	import ChangeList from './ChangeList.svelte';
	import {
		changesSummary,
		shortKey,
		type Changes,
		type KeySummary,
		type Pending,
		type Release
	} from '$lib/releases';

	let {
		key,
		current,
		history,
		changes = null
	}: {
		key: KeySummary;
		current: Pending | null;
		history: (Release & { index: number })[];
		// The latest release's changes in brief.
		changes?: (Changes & { count: number }) | null;
	} = $props();
</script>

<aside
	aria-label="Release log"
	class="flex min-w-0 flex-[1_1_320px] flex-col gap-1 rounded-[18px] bg-surface px-5 py-[18px] ring-1 ring-line ring-inset"
>
	<div class="mb-2.5 flex items-baseline justify-between gap-3">
		<h2 class="m-0 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">
			Release log
		</h2>
		<span class="font-mono text-xs text-fg-3">{shortKey(key.key)}</span>
	</div>
	{#if current}
		<a
			href="/releases/{key.key}/{current.id}"
			aria-label="{current.release?.name ?? 'Proposal'}, pending"
			class="-mx-2 flex gap-3.5 rounded-lg px-2 pt-1 text-fg no-underline transition-colors hover:bg-surface-2"
		>
			<div class="flex w-3 flex-none flex-col items-center" aria-hidden="true">
				<span
					class="h-3 w-3 rounded-full bg-bg shadow-[inset_0_0_0_2px_#fb923c,0_0_10px_rgb(251_146_60/0.5)]"
				></span>
				<span class="w-0.5 flex-1 bg-neutral-800"></span>
			</div>
			<div class="flex flex-1 items-baseline gap-2.5 pb-3.5">
				<span class="w-7 font-mono text-xs text-fg-3">#{current.previous}</span>
				<span class="font-display text-[15px] font-semibold text-apricot-300">
					{current.release?.name ?? '…'}
				</span>
				<span class="ml-auto text-xs text-fg-3">
					{current.signed.length} / {key.quorum} · pending
				</span>
			</div>
		</a>
	{/if}
	{#each history as r (r.index)}
		<a
			href="/releases/{key.key}/{r.index}"
			aria-label="Release #{r.index}, {r.name}"
			class="-mx-2 flex gap-3.5 rounded-lg px-2 pt-1 text-fg no-underline transition-colors hover:bg-surface-2"
		>
			<div class="flex w-3 flex-none flex-col items-center" aria-hidden="true">
				<span class="h-3 w-3 rounded-full bg-accent-400"></span>
				<span class="w-0.5 flex-1 bg-neutral-800"></span>
			</div>
			<div class="flex flex-1 items-baseline gap-2.5 pb-3.5">
				<span class="w-7 font-mono text-xs text-fg-3">#{r.index}</span>
				<span class="font-display text-[15px] font-semibold text-fg">{r.name}</span>
				<span class="ml-auto font-mono text-xs text-fg-3" title={r.commit}>
					{r.commit.slice(0, 7)}
				</span>
			</div>
		</a>
		{#if changes && r.index === key.latest?.index}
			<div class="mb-2 ml-[26px] flex min-w-0 flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2">
				<a
					href="/releases/{key.key}/{r.index}"
					class="text-xs text-fg-2 no-underline hover:text-accent-300"
				>
					{changesSummary(changes, changes.count)}
				</a>
				{#if changes.commits.length}
					<ChangeList {changes} compact />
				{/if}
			</div>
		{/if}
	{:else}
		{#if !current}
			<p class="m-0 text-sm text-fg-3">Nothing signed yet.</p>
		{/if}
	{/each}
</aside>
