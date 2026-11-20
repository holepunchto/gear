<script lang="ts">
	import type { PageProps } from './$types';
	import NewRelease from '$lib/components/releases/NewRelease.svelte';
	import ReleaseList from '$lib/components/releases/ReleaseList.svelte';
	import Revoked from '$lib/components/releases/Revoked.svelte';
	import Retired from '$lib/components/releases/Retired.svelte';

	// What this repo released, as a list like its tags. The layout keeps it
	// live. The key itself, its links and moving away from it are on the key
	// page.
	let { data }: PageProps = $props();

	// Just made from /releases/new?repo=: say so once, until dismissed.
	let dismissed = $state(false);
	const created = $derived(dismissed ? null : data.created);

	// The key a new version is released on: the first this device signs that
	// isn't revoked.
	const releaser = $derived(
		data.keys.map((d) => d.key).find((k) => k.role !== 'follower' && !k.revoked) ?? null
	);
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
	<div class="flex flex-col gap-4">
		{#if created}
			{@const key = data.keys.find((d) => d.key.key === created)?.key}
			{#if key}
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
							Next, release a version.
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
		{/if}

		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 flex-col gap-1">
				{#each data.keys as { key } (key.key)}
					<p class="m-0 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-3">
						<span>Release key <span class="font-mono text-fg-2">{key.name}</span></span>
						<span aria-hidden="true">·</span>
						<span>{key.quorum} of {key.signers.length}</span>
						{#if key.revoked}
							<span aria-hidden="true">·</span>
							<span class="text-red-300">Revoked</span>
						{:else if key.retiredTo}
							<span aria-hidden="true">·</span>
							<span class="text-apricot-300">Retired</span>
						{:else if key.role === 'follower'}
							<span aria-hidden="true">·</span>
							<span>Following</span>
						{/if}
						<span aria-hidden="true">·</span>
						<a
							href="/releases/{key.key}"
							class="tap-44 text-accent-300 no-underline hover:underline"
						>
							Key settings →
						</a>
					</p>
				{/each}
			</div>
			{#if releaser && !releaser.pending.some((p) => p.mine)}
				<NewRelease key={releaser.key} />
			{/if}
		</div>

		{#each data.keys as { key } (key.key)}
			{#if key.revoked}
				<Revoked {key} />
			{:else if key.retiredTo}
				<Retired {key} />
			{/if}
		{/each}

		<ReleaseList repo={data.repo.name} keys={data.keys} latest={data.repo.release} />
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
