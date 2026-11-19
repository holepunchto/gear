<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';
	import SeatDots from '$lib/components/releases/SeatDots.svelte';
	import { liveReleases, shortKey } from '$lib/releases';

	let { data }: PageProps = $props();

	onMount(liveReleases);
</script>

{#if data.keys.length === 0}
	<div class="rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-line ring-inset">
		<h3 class="m-0 text-base font-semibold text-white">No signed releases</h3>
		<p class="mx-auto mt-1.5 max-w-md text-sm text-neutral-400">
			A release key is a signed log of this repo's releases. You pick who signs and how many must
			agree before a tag becomes a release.
		</p>
		<a
			href="/releases/new?repo={encodeURIComponent(data.repo.name)}"
			class="mt-5 inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent-400 px-4 text-sm font-semibold text-accent-900 no-underline transition-colors hover:bg-accent-300 sm:h-10"
		>
			Set up a release key
		</a>
	</div>
{:else}
	<ul class="m-0 flex list-none flex-col gap-4 p-0">
		{#each data.keys as k (k.key)}
			{@const p = k.pending[0]}
			<li>
				<a
					href={p && !p.signedByMe && k.signers.some((s) => s.me)
						? `/releases/${k.key}/${p.id}`
						: `/releases/${k.key}`}
					aria-label="{k.name} releases"
					class="flex flex-col gap-2.5 rounded-2xl bg-surface p-[18px] text-fg no-underline ring-1 ring-line transition-colors ring-inset hover:bg-surface-2"
				>
					<div class="flex items-center justify-between gap-3">
						<h2 class="m-0 font-sans text-xs font-semibold tracking-[0.08em] text-fg-3 uppercase">
							Signed release
						</h2>
						<span class="truncate font-mono text-[11px] font-medium text-fg-3">{k.name}</span>
					</div>
					<div class="flex flex-wrap items-baseline gap-2.5">
						<span class="font-display text-2xl font-semibold tracking-[-0.02em]">
							{k.latest?.name ?? 'None yet'}
						</span>
						<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-300">
							<SeatDots n={k.signers.length} filled={k.quorum} />
							{k.quorum} of {k.signers.length}
							{k.latest ? 'signed' : 'must sign'}
						</span>
						<span class="ml-auto font-mono text-xs text-fg-3">{shortKey(k.key)}</span>
					</div>
					{#if p}
						<span class="text-xs text-apricot-300">
							{p.release?.name ?? 'A release'} is waiting on
							{#if !p.mine}
								{p.signedByMe ? 'its proposer to commit' : 'your signature'}
							{:else if k.quorum > p.signed.length}
								{k.quorum - p.signed.length} more
								{k.quorum - p.signed.length === 1 ? 'signature' : 'signatures'}
							{:else}
								a commit
							{/if}
						</span>
					{:else if k.latest}
						<span class="font-mono text-xs text-fg-3">
							{k.latest.tag} · {k.latest.commit.slice(0, 7)} · entry #{k.latest.index}
						</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}
