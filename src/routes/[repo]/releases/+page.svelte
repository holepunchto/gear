<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import KeySetup from '$lib/components/releases/KeySetup.svelte';
	import ProposeForm from '$lib/components/releases/ProposeForm.svelte';
	import ReleaseList from '$lib/components/releases/ReleaseList.svelte';
	import Revoked from '$lib/components/releases/Revoked.svelte';
	import Retired from '$lib/components/releases/Retired.svelte';

	// What this repo released, as a list like its tags, and New release,
	// which opens on this tab like New tag. The layout keeps it live. The key
	// itself, its links and moving away from it are on the key page.
	let { data }: PageProps = $props();

	// The keys a new version can be released on: the ones this device signs
	// that aren't revoked, and have none of its releases in progress.
	const releasable = $derived(
		data.keys.filter(
			(d) => d.key.role !== 'follower' && !d.key.revoked && !d.key.pending.some((p) => p.mine)
		)
	);

	// Open, and on which key; ?new=<key> opens it from the key page. With no
	// key yet, it sets one up first.
	let releasing = $state<string | null>(untrack(() => page.url.searchParams.get('new')));
	const open = $derived(
		releasing === null
			? null
			: (releasable.find((d) => d.key.key === releasing) ?? releasable[0] ?? null)
	);
	const canRelease = $derived(releasable.length > 0 || data.setup !== null);
</script>

<div class="flex flex-col gap-4">
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
					<a href="/releases/{key.key}" class="tap-44 text-accent-300 no-underline hover:underline">
						Key settings →
					</a>
				</p>
			{:else}
				<p class="m-0 text-[13px] text-fg-3">
					{data.archived
						? `Every release key for ${data.repo.name} is archived on this device.`
						: `No release key for ${data.repo.name} yet. New release sets one up.`}
				</p>
			{/each}
		</div>
		{#if canRelease && releasing === null}
			<button
				type="button"
				onclick={() => (releasing = releasable[0]?.key.key ?? '')}
				class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] bg-surface-4 px-3.5 text-[13px] font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3"
			>
				New release
			</button>
		{/if}
	</div>

	{#if canRelease && releasing !== null}
		<section
			aria-label="New release"
			class="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line ring-inset sm:p-5"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="m-0 text-base font-semibold text-fg">
					New release{open && releasable.length > 1 ? ` on ${open.key.name}` : ''}
				</h2>
				<button
					type="button"
					onclick={() => (releasing = null)}
					class="tap-44 cursor-pointer text-[13px] text-fg-3 hover:text-fg"
				>
					Cancel
				</button>
			</div>
			{#if open}
				{#key open.key.key}
					<ProposeForm key={open.key} candidates={open.candidates} />
				{/key}
			{:else if data.setup}
				<KeySetup repo={data.repo.name} seat={data.setup.seat} pearKeys={data.setup.pearKeys} />
			{/if}
		</section>
	{/if}

	{#each data.keys as { key } (key.key)}
		{#if key.revoked}
			<Revoked {key} />
		{:else if key.retiredTo}
			<Retired {key} />
		{/if}
	{/each}

	<ReleaseList repo={data.repo.name} keys={data.keys} latest={data.repo.release} />

	{#if data.archived}
		<a href="/releases#archived" class="self-start text-[13px] text-fg-3 hover:text-accent-300">
			{data.archived} archived {data.archived === 1 ? 'key' : 'keys'} →
		</a>
	{/if}
</div>
