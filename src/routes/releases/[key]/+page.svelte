<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';
	import ProposeForm from '$lib/components/releases/ProposeForm.svelte';
	import ReleaseLog from '$lib/components/releases/ReleaseLog.svelte';
	import KeyShare from '$lib/components/releases/KeyShare.svelte';
	import MoveAway from '$lib/components/releases/MoveAway.svelte';
	import Revoked from '$lib/components/releases/Revoked.svelte';
	import Retired from '$lib/components/releases/Retired.svelte';
	import RotateNext from '$lib/components/releases/RotateNext.svelte';
	import ReleaseSeal from '$lib/components/releases/ReleaseSeal.svelte';
	import ReleaseInProgress from '$lib/components/releases/ReleaseInProgress.svelte';
	import {
		ago,
		avatar,
		liveReleases,
		proposalName,
		shortKey,
		signerInitials,
		signerName
	} from '$lib/releases';

	let { data }: PageProps = $props();

	onMount(liveReleases);

	const key = $derived(data.key);
	const current = $derived(key.revoked ? null : (key.pending[0] ?? null));
	let showRevoked = $state(false);
</script>

<svelte:head>
	<title>{key.name} · Release keys · Gear</title>
</svelte:head>

<main class="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pt-6 pb-20 sm:px-8 sm:pt-7">
	<nav class="flex min-w-0 items-center gap-2 text-[13px] text-fg-3">
		<a href="/releases" class="tap-44 shrink-0 text-fg-2 no-underline hover:text-accent-300">
			Release keys
		</a>
		<span>/</span>
		<span class="truncate font-mono text-fg-2">{key.name}</span>
	</nav>

	<section class="flex flex-wrap items-end justify-between gap-7">
		<div class="flex min-w-0 flex-col gap-2.5">
			<div class="flex flex-wrap items-center gap-3.5">
				<h1
					class="m-0 font-display text-[48px] leading-none font-semibold tracking-[-0.04em] break-all text-fg sm:text-[64px]"
				>
					{current
						? proposalName(current, 'Proposal')
						: key.revoked
							? key.name
							: (key.latest?.name ?? key.name)}
				</h1>
				{#if current}
					<span
						class="inline-flex items-center gap-2 rounded-full bg-apricot-400/12 px-3 py-[5px] text-xs font-semibold text-apricot-300"
					>
						<span class="h-2 w-2 animate-pulse rounded-full bg-apricot-400" aria-hidden="true"
						></span>
						Collecting signatures
					</span>
				{:else if key.revoked}
					<span
						class="inline-flex items-center rounded-full bg-red-500/14 px-3 py-[5px] text-xs font-semibold text-red-300"
					>
						Revoked: don't trust
					</span>
				{:else if key.format === 'old'}
					<span
						class="inline-flex items-center rounded-full bg-white/6 px-3 py-[5px] text-xs font-semibold text-fg-2"
					>
						Old release format
					</span>
				{:else if key.latest}
					<ReleaseSeal quorum={key.quorum} signers={key.signers.length} />
				{/if}
			</div>
			<span class="text-fg-2">
				{#if current}
					Proposed by <b class="font-semibold text-fg">{current.mine ? 'you' : 'a co-signer'}</b>
					· {ago(current.added)} · signs the repo up to length {current.length}
				{:else if key.format === 'old'}
					<span class="font-mono text-fg">{key.name}</span> · made before release keys mirrored the repo
				{:else if key.latest}
					<span class="font-mono text-fg">{key.name}</span> · {key.released}
					{key.released === 1 ? 'tag' : 'tags'} signed
				{:else}
					No releases yet · {key.quorum} of {key.signers.length} must sign
				{/if}
				{#if key.role === 'follower'}
					· <span class="text-fg">Following</span>
				{/if}
				{#if key.archived}
					· <span class="text-fg">Archived</span>
				{/if}
			</span>
			{#if key.latest}
				<KeyShare keyText={key.key} share={key.share} />
			{:else if key.format === 'mirror' && !key.revoked && key.role !== 'follower'}
				<span class="text-[13px] text-fg-3">Share links appear after your first release.</span>
			{/if}
		</div>

		{#if current}
			<div class="flex w-full min-w-0 flex-col gap-2 sm:w-[320px]">
				<div class="flex justify-between text-[13px]">
					<span class="text-fg-2">
						{current.mine ? 'Signatures' : 'Signatures on this device'}
					</span>
					<span>
						<b class="font-display text-lg font-semibold">{current.signed.length}</b>
						<span class="text-fg-3">of {key.quorum} needed</span>
					</span>
				</div>
				<div
					class="grid gap-1.5"
					style="grid-template-columns: repeat({key.quorum}, minmax(0, 1fr))"
				>
					{#each { length: key.quorum }, i}
						<span
							class="h-2 rounded {i < current.signed.length
								? 'bg-accent-400 shadow-[0_0_12px_#23cc94]'
								: 'bg-[repeating-linear-gradient(90deg,#3a2c20_0_6px,#1a1610_6px_12px)]'}"
						></span>
					{/each}
				</div>
			</div>
		{/if}
	</section>

	{#if key.revoked}
		<Revoked {key} />
	{:else if key.retiredTo}
		<Retired {key} />
	{:else if key.format === 'old'}
		<p
			class="m-0 rounded-2xl bg-surface px-5 py-4 text-sm leading-normal text-fg-2 ring-1 ring-line ring-inset"
		>
			This key was made before release keys mirrored the repo, so Gear no longer reads it. Archive
			it below, and make a new key for this repo.
		</p>
	{/if}
	{#if data.rotated && !key.revoked}
		<RotateNext {key} from={data.rotated} app={data.app} />
	{/if}

	<section
		aria-label="Signers"
		class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-4"
	>
		{#each key.signers as s, i (s.key)}
			{@const signed = current?.signed.includes(s.key) ?? false}
			<article
				class="flex flex-col gap-4 rounded-[18px] p-[18px] ring-1 ring-inset {signed
					? 'bg-linear-170 from-[#10201a] to-[#0b130f] ring-accent-300/30'
					: current && s.me
						? 'bg-linear-170 from-[#1a140d] to-[#0f0d09] ring-apricot-400/35'
						: 'bg-surface ring-line'}"
			>
				<div class="flex items-center gap-3">
					<span
						class="flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-semibold {avatar(
							i
						)} {s.me ? 'shadow-[0_0_0_2px_#23cc94,0_0_18px_rgb(35_204_148/0.5)]' : ''}"
						aria-hidden="true">{signerInitials(s)}</span
					>
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="truncate font-semibold text-fg">{signerName(s)}</span>
						<span class="truncate text-xs {s.me ? 'text-accent-300' : 'text-fg-3'}">
							{s.me ? 'you · this device' : s.label ? shortKey(s.key) : 'co-signer'}
						</span>
					</div>
				</div>
				{#if current}
					<div class="flex items-center gap-2.5">
						{#if signed}
							<span
								class="rounded-full bg-accent-400/14 px-2.5 py-1 text-xs font-semibold text-accent-300"
							>
								✓ Signed
							</span>
						{:else if s.me}
							<a
								href="/releases/{key.key}/{current.id}"
								class="rounded-full bg-apricot-400/14 px-2.5 py-1 text-xs font-semibold text-apricot-300 no-underline"
							>
								Review &amp; sign
							</a>
						{:else}
							<span class="rounded-full bg-white/6 px-2.5 py-1 text-xs font-semibold text-fg-2">
								{current.mine ? 'Waiting' : 'Not seen here'}
							</span>
						{/if}
					</div>
				{/if}
			</article>
		{/each}
	</section>

	<div class="flex flex-wrap items-start gap-6">
		<div class="flex min-w-0 flex-[999_1_600px] flex-col gap-6">
			{#if current}
				<ReleaseInProgress {key} {current} />
			{:else if key.role !== 'follower' && !key.archived && !key.revoked && key.format === 'mirror'}
				<ProposeForm {key} candidates={data.candidates} />
			{/if}
			<MoveAway {key} />
		</div>

		{#if !key.revoked || showRevoked}
			<ReleaseLog {key} {current} history={data.history} changes={data.changes} />
		{:else if key.length}
			<button
				type="button"
				onclick={() => (showRevoked = true)}
				class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] px-4 text-sm font-medium text-fg-2 ring-1 ring-line-strong ring-inset hover:text-fg sm:h-9"
			>
				Show what it signed anyway
			</button>
		{/if}
	</div>
</main>
