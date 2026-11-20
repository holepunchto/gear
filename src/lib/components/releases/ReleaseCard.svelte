<script lang="ts">
	import { releaseHref, releaseWaiting, type RepoRelease } from '$lib/releases';

	let { release }: { release: RepoRelease } = $props();

	const waiting = $derived(releaseWaiting(release));
</script>

<a
	href={releaseHref(release)}
	aria-label="Signed release"
	class="flex flex-col gap-2.5 rounded-2xl bg-surface p-[18px] text-fg no-underline ring-1 ring-line transition-colors ring-inset hover:bg-surface-2"
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
			{release.quorum} of {release.signers}
			{release.version ? 'signed' : 'must sign'}
		</span>
	</div>
	{#if waiting}
		<span class="text-xs text-apricot-300">{waiting}</span>
	{/if}
</a>
