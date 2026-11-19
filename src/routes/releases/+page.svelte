<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import SeatRing from '$lib/components/releases/SeatRing.svelte';
	import FollowKey from '$lib/components/releases/FollowKey.svelte';
	import KeyShare from '$lib/components/releases/KeyShare.svelte';
	import PearSign from '$lib/components/releases/PearSign.svelte';
	import {
		avatar,
		liveReleases,
		proposalName,
		shortKey,
		signerInitials,
		signerName
	} from '$lib/releases';

	let { data, form }: PageProps = $props();
	let receiving = $state(false);
	let unarchiving = $state<string | null>(null);

	onMount(liveReleases);

	const active = $derived(data.keys.filter((k) => !k.archived));
	const archived = $derived(data.keys.filter((k) => k.archived));

	// Proposals from co-signers this device hasn't signed yet.
	const waiting = $derived(
		data.keys.flatMap((k) =>
			k.pending.filter((p) => !p.mine && !p.signedByMe).map((p) => ({ key: k, p }))
		)
	);

	function pendingLine(k: (typeof data.keys)[number]) {
		const p = k.pending[0];
		if (!p) return '';
		const name = proposalName(p);
		if (!p.signedByMe && k.signers.some((s) => s.me)) return `${name} proposed · waiting on you`;
		// Signatures on someone else's proposal are collected on their device.
		if (!p.mine) return `${name} proposed · you signed`;
		return `${name} proposed · ${p.signed.length} of ${k.quorum} signatures in`;
	}
</script>

<svelte:head>
	<title>Release keys · Gear</title>
</svelte:head>

<main class="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 pt-6 pb-20 sm:px-8 sm:pt-11">
	<section class="flex flex-wrap items-end justify-between gap-6">
		<div class="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
			<span
				class="inline-flex items-center gap-2 self-start rounded-full bg-accent-400/10 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-accent-300 uppercase"
			>
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" /></svg
				>
				Multi-signed
			</span>
			<h1
				class="m-0 font-display text-[40px] leading-none font-semibold tracking-[-0.04em] text-fg sm:text-[56px]"
			>
				Release keys
			</h1>
			<p class="m-0 max-w-[600px] text-base leading-relaxed text-fg-2">
				Each release key is its own signed log. You choose who signs and how many must agree. A
				release only appends once enough of them have checked it on their own copy.
			</p>
		</div>
		<a
			href="/releases/new"
			class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-400 px-[18px] text-[15px] font-semibold text-accent-900 no-underline shadow-[0_10px_30px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300 sm:w-auto"
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				stroke-linecap="round"
				aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
			>
			New release key
		</a>
	</section>

	{#each waiting as { key, p } (p.id)}
		<a
			href="/releases/{key.key}/{p.id}"
			class="flex flex-wrap items-center gap-4 rounded-2xl bg-linear-90 from-[#1b140c] to-[#0f0d09] px-5 py-4 text-fg no-underline shadow-[inset_0_0_0_1px_rgb(251_146_60/0.35),0_0_40px_rgb(251_146_60/0.1)]"
		>
			<span
				class="flex h-10 w-10 items-center justify-center rounded-xl bg-apricot-400/16 text-apricot-400"
				aria-hidden="true"
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M3 21c3 0 7-1 9-6l6-6a2.8 2.8 0 0 0-4-4l-6 6c-5 2-6 6-6 9z" /><path
						d="M14 5l5 5"
					/></svg
				>
			</span>
			<span class="min-w-[220px] flex-1">
				<b class="font-semibold">{key.name} · {proposalName(p, '')}</b>
				<span class="text-[#c9b7a4]">needs your signature</span>
			</span>
			<span class="font-mono text-xs text-apricot-300">
				{key.quorum} of {key.signers.length} must sign
			</span>
			<span
				class="inline-flex h-9 items-center rounded-[10px] bg-apricot-400 px-3.5 text-[13px] font-semibold text-[#2a1405]"
			>
				Review &amp; sign
			</span>
		</a>
	{/each}

	<section
		aria-label="Paste a proposal"
		class="flex flex-col gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line ring-inset"
	>
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="m-0 text-base font-semibold text-fg">Sign for someone</h2>
			<span class="text-xs text-fg-3">
				A co-signer sends you a proposal. Paste it here to check it and sign.
			</span>
		</div>
		<form
			method="POST"
			action="?/receive"
			class="flex flex-col gap-2 sm:flex-row"
			use:enhance={() => {
				receiving = true;
				return async ({ update }) => {
					await update();
					receiving = false;
				};
			}}
		>
			<label class="sr-only" for="proposal">Proposal</label>
			<input
				id="proposal"
				name="proposal"
				required
				autocomplete="off"
				spellcheck="false"
				placeholder="Paste a proposal"
				class="min-w-0 flex-1 rounded-[10px] border-0 bg-bg px-3 py-2.5 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={receiving}
				class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-auto"
			>
				{receiving ? 'Opening…' : 'Open proposal'}
			</button>
		</form>
		{#if form?.receive?.error}
			<p class="m-0 text-xs text-red-400">{form.receive.error}</p>
		{/if}
		{#if form?.receive?.request}
			<p class="m-0 text-xs text-fg-2">
				If you sign this key with a pear key, sign it with the CLI:
			</p>
			<PearSign request={form.receive.request} open />
		{/if}
	</section>

	<FollowKey action="?/follow" error={form?.follow?.error} />

	<section aria-label="Your release keys" class="flex flex-col gap-3.5">
		<div class="flex items-baseline gap-3.5">
			<h2 class="m-0 text-xl font-semibold text-fg">Keys you own, sign for or follow</h2>
			<span class="text-[13px] text-fg-3">
				{active.length}
				{active.length === 1 ? 'key' : 'keys'}
			</span>
		</div>

		{#if active.length === 0}
			<div class="rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-line ring-inset">
				<h3 class="m-0 text-base font-semibold text-fg">No release keys yet</h3>
				<p class="mx-auto mt-1.5 max-w-md text-sm text-fg-2">
					Make one for a repo you release from, paste a proposal a co-signer sent you, or follow
					someone's key.
				</p>
			</div>
		{:else}
			<ul
				class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] gap-4 p-0"
			>
				{#each active as k (k.key)}
					<li class="flex flex-col gap-2">
						<a
							href="/releases/{k.key}"
							class="flex h-full flex-col gap-3.5 rounded-[18px] bg-surface p-[18px] text-fg no-underline ring-1 transition-colors ring-inset hover:bg-surface-2 {k
								.pending.length
								? 'ring-apricot-400/30'
								: 'ring-line'}"
						>
							<div class="flex items-start gap-3.5">
								<SeatRing m={k.quorum} n={k.signers.length} />
								<div class="flex min-w-0 flex-1 flex-col gap-1">
									<span
										class="truncate font-display text-lg font-semibold tracking-[-0.01em] text-fg"
									>
										{k.name}
									</span>
									<span class="font-mono text-xs text-fg-3">{shortKey(k.key)}</span>
									<span
										class="self-start rounded-full px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] uppercase {k.owner
											? 'bg-accent-400/12 text-accent-300'
											: 'bg-white/6 text-fg-2'}"
									>
										{k.role === 'owner' ? 'Owner' : k.role === 'follower' ? 'Following' : 'Signer'}
									</span>
								</div>
								<div class="flex flex-col items-end gap-0.5 text-right">
									<span class="font-display text-[22px] font-semibold text-fg">
										{k.latest?.name ?? '—'}
									</span>
									<span class="text-xs text-fg-3">
										{k.rotatedTo
											? `rotated to ${k.rotatedTo.name ?? shortKey(k.rotatedTo.to)}`
											: k.latest
												? `#${k.latest.index}`
												: 'no releases yet'}
									</span>
								</div>
							</div>
							<div
								class="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs text-fg-3"
							>
								<span class="flex" aria-hidden="true">
									{#each k.signers as s, i (s.key)}
										<span
											class="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold shadow-[0_0_0_2px_var(--color-surface)] {avatar(
												i
											)} {i ? '-ml-1.5' : ''}"
											title={signerName(s)}>{signerInitials(s)}</span
										>
									{/each}
								</span>
								<span>{k.quorum} of {k.signers.length} must sign</span>
								<span class="ml-auto font-mono">length {k.length}</span>
								{#if k.repo}<span class="font-mono">{k.repo.name}</span>{/if}
							</div>
							{#if k.pending.length}
								<div
									class="flex items-center gap-2.5 rounded-[10px] bg-apricot-400/8 px-3 py-2.5 text-xs text-apricot-300"
								>
									<span
										class="h-3 w-3 animate-spin rounded-full border-2 border-apricot-400/30 border-t-apricot-400"
										aria-hidden="true"
									></span>
									{pendingLine(k)}
								</div>
							{/if}
						</a>
						<KeyShare keyText={k.key} share={k.share} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if archived.length}
		<section id="archived" aria-label="Archived release keys" class="flex flex-col gap-3.5">
			<div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
				<h2 class="m-0 text-xl font-semibold text-fg">Archived</h2>
				<span class="text-[13px] text-fg-3">
					Hidden from repos on this device. Gear still seeds them.
				</span>
			</div>
			<ul class="m-0 flex list-none flex-col gap-2 p-0">
				{#each archived as k (k.key)}
					<li
						class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line ring-inset"
					>
						<a
							href="/releases/{k.key}"
							class="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5 text-fg no-underline hover:text-accent-300"
						>
							<span class="truncate font-mono text-sm font-medium">{k.name}</span>
							<span class="text-xs text-fg-3">
								{k.role === 'owner' ? 'Owner' : k.role === 'follower' ? 'Following' : 'Signer'}
								· {k.latest ? `${k.latest.name} · #${k.latest.index}` : 'no releases'}
								{#if k.repo}· {k.repo.name}{/if}
							</span>
						</a>
						<form
							method="POST"
							action="/releases/{k.key}?/unarchive"
							use:enhance={() => {
								unarchiving = k.key;
								return async ({ update }) => {
									await update();
									unarchiving = null;
								};
							}}
						>
							<button
								type="submit"
								disabled={unarchiving !== null}
								class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-9"
							>
								{unarchiving === k.key ? 'Unarchiving…' : 'Unarchive'}
							</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
