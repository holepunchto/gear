<script lang="ts">
	import type { PageProps } from './$types';
	import SeatDots from '$lib/components/releases/SeatDots.svelte';
	import ProposeForm from '$lib/components/releases/ProposeForm.svelte';
	import ReleaseInProgress from '$lib/components/releases/ReleaseInProgress.svelte';
	import ReleaseLog from '$lib/components/releases/ReleaseLog.svelte';
	import ReleaseSeal from '$lib/components/releases/ReleaseSeal.svelte';
	import KeyShare from '$lib/components/releases/KeyShare.svelte';
	import Revoked from '$lib/components/releases/Revoked.svelte';
	import Retired from '$lib/components/releases/Retired.svelte';
	import { multisig, shortKey, signerName, tagHref } from '$lib/releases';

	// What this repo released. The layout keeps it live. The key itself, its
	// links and moving away from it are on the key page.
	let { data }: PageProps = $props();

	// Just made from /releases/new?repo=: say so once, until dismissed.
	let dismissed = $state(false);
	const created = $derived(dismissed ? null : data.created);
</script>

{#if data.keys.length === 0}
	<section
		aria-label="Set up signed releases"
		class="flex flex-col items-start gap-3.5 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
	>
		<h2 class="m-0 text-xl font-semibold text-fg">Set up signed releases</h2>
		<p class="m-0 max-w-2xl text-sm text-fg-2">
			{#if data.archived}
				Every release key for {data.repo.name} is archived on this device. Unarchive one, or make a new
				one.
			{:else}
				A release key is a signed log of {data.repo.name}'s releases. You pick who signs and how
				many must agree before a tag becomes a release.
			{/if}
		</p>
		<a
			href="/releases/new?repo={encodeURIComponent(data.repo.name)}"
			class="inline-flex h-12 items-center rounded-xl bg-accent-400 px-6 text-[15px] font-semibold text-accent-900 no-underline shadow-[0_10px_30px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300"
		>
			Make a release key
		</a>
	</section>
{:else}
	<div class="flex flex-col gap-8">
		{#each data.keys as d (d.key.key)}
			{@const key = d.key}
			{@const current = key.revoked ? null : (key.pending[0] ?? null)}
			<article class="flex flex-col gap-4" aria-label="{key.name} releases">
				{#if created === key.key}
					<div
						role="status"
						class="flex items-start gap-3 rounded-2xl bg-accent-400/8 px-5 py-4 ring-1 ring-accent-400/30 ring-inset"
					>
						<span
							class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-400 text-xs font-bold text-accent-900"
							aria-hidden="true">✓</span
						>
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<span class="font-semibold text-fg">
								Release key <span class="font-mono">{key.name}</span> created
							</span>
							<span class="text-sm text-fg-2">
								Next, release a version below.
								{#if key.quorum > 1}
									Gear takes you through collecting your co-signers' signatures.
								{:else}
									You sign it alone, so it is released as soon as you sign.
								{/if}
							</span>
						</div>
						<button
							type="button"
							onclick={() => (dismissed = true)}
							aria-label="Dismiss"
							class="tap-44 cursor-pointer border-0 bg-transparent text-lg leading-none text-fg-3 hover:text-fg"
							>×</button
						>
					</div>
				{/if}
				<header
					class="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl bg-surface p-[18px] ring-1 ring-line ring-inset"
				>
					<div class="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
						<span class="font-sans text-xs font-semibold tracking-[0.08em] text-fg-3 uppercase">
							Release key
						</span>
						<span class="truncate font-mono text-[15px] font-medium text-fg">{key.name}</span>
					</div>
					<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-300">
						<SeatDots n={key.signers.length} filled={key.quorum} />
						{key.quorum} of {key.signers.length} must sign
					</span>
					{#if key.revoked}
						<span
							class="rounded-full bg-red-500/14 px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] text-red-300 uppercase"
						>
							Revoked
						</span>
					{:else if key.role === 'follower'}
						<span
							class="rounded-full bg-white/6 px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] text-fg-2 uppercase"
						>
							Following
						</span>
					{/if}
					<span class="min-w-0 flex-[1_1_200px] truncate text-xs text-fg-2">
						{key.signers.map((s) => (s.me ? 'You' : signerName(s))).join(', ')}
					</span>
					<a
						href="/releases/{key.key}"
						class="tap-44 ml-auto text-[13px] font-medium text-accent-300 no-underline hover:underline"
					>
						Key page <span class="font-mono text-fg-3">{shortKey(key.key)}</span> →
					</a>
					{#if key.latest}
						<KeyShare keyText={key.key} share={key.share} />
					{/if}
				</header>

				{#if key.revoked}
					<Revoked {key} />
				{:else if key.retiredTo}
					<Retired {key} />
				{/if}
				{#if key.latest && !key.revoked}
					<section
						aria-label="Latest release"
						class="flex flex-col gap-3 rounded-2xl p-[18px] ring-1 ring-inset {multisig(
							key.signers.length
						)
							? 'bg-seal-500/12 shadow-glow-seal ring-seal-400/45'
							: 'bg-seal-500/5 ring-seal-400/20'}"
					>
						<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
							<span class="text-[13px] text-fg-2">Latest release</span>
							<a
								href={tagHref(key.key, key.latest.tag)}
								class="font-display text-lg font-semibold text-seal-200 no-underline hover:underline"
							>
								{key.latest.name}
							</a>
							<ReleaseSeal quorum={key.quorum} signers={key.signers.length} />
						</div>
					</section>
				{:else if !key.revoked}
					<p class="m-0 text-[13px] text-fg-3">
						{key.arriving
							? 'The signed repo is still arriving.'
							: 'Nothing is released on this key yet.'}
					</p>
				{/if}
				{#if current}
					<ReleaseInProgress {key} {current} />
				{:else if key.role !== 'follower' && !key.revoked}
					<ProposeForm {key} candidates={d.candidates} />
				{/if}
				<ReleaseLog {key} history={d.history} />
			</article>
		{/each}
	</div>
{/if}

{#if data.archived}
	<a
		href="/releases#archived"
		class="mt-4 inline-block text-[13px] text-fg-3 hover:text-accent-300"
	>
		{data.archived} archived {data.archived === 1 ? 'key' : 'keys'} →
	</a>
{/if}
