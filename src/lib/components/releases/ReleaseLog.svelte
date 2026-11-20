<script lang="ts">
	import ChangeList from './ChangeList.svelte';
	import {
		changesSummary,
		multisig,
		proposalName,
		shortKey,
		tagHref,
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
		// Every signed tag, newest first.
		history: Release[];
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
	{#if key.length}
		<p class="m-0 mb-2 text-xs leading-normal text-fg-3">
			Every tag in the repo as signed, up to length {key.length}.
		</p>
	{/if}
	{#if current}
		<a
			href="/releases/{key.key}/{current.id}"
			aria-label="{proposalName(current, 'Proposal')}, pending"
			class="-mx-2 flex gap-3.5 rounded-lg px-2 pt-1 text-fg no-underline transition-colors hover:bg-surface-2"
		>
			<div class="flex w-3 flex-none flex-col items-center" aria-hidden="true">
				<span
					class="h-3 w-3 rounded-full bg-bg shadow-[inset_0_0_0_2px_#fb923c,0_0_10px_rgb(251_146_60/0.5)]"
				></span>
				<span class="w-0.5 flex-1 bg-neutral-800"></span>
			</div>
			<div class="flex flex-1 items-baseline gap-2.5 pb-3.5">
				<span class="font-display text-[15px] font-semibold text-apricot-300">
					{proposalName(current, '…')}
				</span>
				<span class="ml-auto text-xs text-fg-3">
					{current.signed.length} / {key.quorum} · pending
				</span>
			</div>
		</a>
	{/if}
	{#each history as r (r.tag)}
		<a
			href={tagHref(key.key, r.tag)}
			aria-label="{r.name}, signed"
			class="-mx-2 flex gap-3.5 rounded-lg px-2 pt-1 text-fg no-underline transition-colors hover:bg-surface-2"
		>
			<div class="flex w-3 flex-none flex-col items-center" aria-hidden="true">
				<span
					class="h-3 w-3 rounded-full {key.revoked
						? 'bg-neutral-600'
						: 'bg-seal-400'} {!key.revoked && multisig(key.signers.length)
						? 'shadow-[0_0_8px_rgb(139_92_246/0.7)]'
						: ''}"
				></span>
				<span class="w-0.5 flex-1 bg-neutral-800"></span>
			</div>
			<div class="flex flex-1 items-baseline gap-2.5 pb-3.5">
				<span class="font-display text-[15px] font-semibold text-fg">{r.name}</span>
				<span class="ml-auto font-mono text-xs text-fg-3" title={r.commit}>
					{r.commit.slice(0, 7)}
				</span>
			</div>
		</a>
		{#if changes && r.tag === key.latest?.tag}
			<div class="mb-2 ml-[26px] flex min-w-0 flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2">
				<a
					href={tagHref(key.key, r.tag)}
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
			<p class="m-0 text-sm text-fg-3">
				{key.arriving ? 'The signed repo is still arriving.' : 'Nothing signed yet.'}
			</p>
		{/if}
	{/each}
</aside>
