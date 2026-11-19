<script lang="ts">
	import ReleaseSeal from './ReleaseSeal.svelte';
	import { multisig, releaseHref, releaseWaiting, type RepoRelease } from '$lib/releases';

	let { release }: { release: RepoRelease } = $props();

	const waiting = $derived(releaseWaiting(release));
	const sealed = $derived(release.version !== null && multisig(release.signers));
</script>

<a
	href={releaseHref(release)}
	aria-label="Signed release"
	class="flex flex-col gap-2.5 rounded-2xl bg-surface p-[18px] text-fg no-underline ring-1 transition-colors ring-inset hover:bg-surface-2 {sealed
		? 'shadow-glow-seal ring-seal-400/30'
		: 'ring-line'}"
>
	<div class="flex items-center justify-between gap-3">
		<h2 class="m-0 font-sans text-xs font-semibold tracking-[0.08em] text-fg-3 uppercase">
			Signed release
		</h2>
		<span class="truncate font-mono text-[11px] font-medium text-fg-3">{release.name}</span>
	</div>
	<div class="flex flex-wrap items-baseline gap-2.5">
		<span class="font-display text-2xl font-semibold tracking-[-0.02em]">
			{release.version ?? 'None yet'}
		</span>
		{#if release.version}
			<ReleaseSeal quorum={release.quorum} signers={release.signers} />
		{:else}
			<span class="inline-flex items-center gap-[5px] text-xs font-semibold text-accent-300">
				<svg
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
					><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" /><path
						d="m9 12 2 2 4-4"
					/></svg
				>
				{release.quorum} of {release.signers} must sign
			</span>
		{/if}
	</div>
	{#if waiting}
		<span class="text-xs text-apricot-300">{waiting}</span>
	{/if}
</a>
