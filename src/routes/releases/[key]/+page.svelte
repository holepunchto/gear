<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import CopyField from '$lib/components/releases/CopyField.svelte';
	import {
		ago,
		avatar,
		liveReleases,
		shortKey,
		signerInitials,
		signerName,
		type Release
	} from '$lib/releases';

	let { data, form }: PageProps = $props();

	let busy = $state<string | null>(null);

	onMount(liveReleases);

	const key = $derived(data.key);
	const current = $derived(key.pending[0] ?? null);
	const ready = $derived(current !== null && current.signed.length >= key.quorum);

	function submitting(name: string) {
		return () => {
			busy = name;
			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
				busy = null;
			};
		};
	}

	function payload(r: Release, previous: number) {
		return [
			{ k: 'Tag', v: r.tag },
			{ k: 'Commit', v: r.commit },
			{ k: 'Tree hash', v: r.tree },
			{ k: 'Repo at length', v: `${key.repo?.name ?? shortKey(r.repo.key)} @ ${r.repo.length}` },
			{
				k: 'Previous release',
				v:
					previous === 0
						? 'none, this is the first'
						: `#${previous - 1} · ${data.history[0]?.name ?? ''}`
			}
		];
	}

	const actionError = $derived(
		form?.propose?.error ?? form?.sign?.error ?? form?.respond?.error ?? form?.commit?.error ?? null
	);
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
					{current ? (current.release?.name ?? 'Proposal') : (key.latest?.name ?? key.name)}
				</h1>
				{#if current}
					<span
						class="inline-flex items-center gap-2 rounded-full bg-apricot-400/12 px-3 py-[5px] text-xs font-semibold text-apricot-300"
					>
						<span class="h-2 w-2 animate-pulse rounded-full bg-apricot-400" aria-hidden="true"
						></span>
						Collecting signatures
					</span>
				{:else if key.latest}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-accent-400/12 px-3 py-[5px] text-xs font-semibold text-accent-300"
					>
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
						Signed release
					</span>
				{/if}
			</div>
			<span class="text-fg-2">
				{#if current}
					Proposed by <b class="font-semibold text-fg">{current.mine ? 'you' : 'a co-signer'}</b>
					· {ago(current.added)} · will be entry
					<span class="font-mono text-fg">#{current.previous}</span> of the release log
				{:else if key.latest}
					<span class="font-mono text-fg">{key.name}</span> · entry #{key.latest.index} · {key.quorum}
					of {key.signers.length} signed
				{:else}
					No releases yet · {key.quorum} of {key.signers.length} must sign
				{/if}
			</span>
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
				<section
					aria-label="What is being signed"
					class="overflow-hidden rounded-[18px] bg-surface ring-1 ring-line ring-inset"
				>
					<h2
						class="m-0 bg-surface-2 px-5 py-3.5 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase"
					>
						What gets signed
					</h2>
					{#if current.release}
						<dl
							class="m-0 grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] px-5 pt-2 pb-3 sm:grid-cols-[160px_minmax(0,1fr)]"
						>
							{#each payload(current.release, current.previous) as p (p.k)}
								<dt class="border-b border-white/4 py-[11px] text-fg-2">{p.k}</dt>
								<dd
									class="m-0 truncate border-b border-white/4 py-[11px] font-mono text-[13px] text-fg"
									title={p.v}
								>
									{p.v}
								</dd>
							{/each}
						</dl>
					{:else}
						<p class="m-0 px-5 py-4 text-sm text-fg-2">
							Not checked on this device yet.
							<a href="/releases/{key.key}/{current.id}">Inspect the proposal</a> to see it.
						</p>
					{/if}
				</section>

				<section
					aria-label="Collect signatures"
					class="flex flex-col gap-4 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
				>
					{#if current.mine}
						<div class="flex flex-col gap-2">
							<h2 class="m-0 text-base font-semibold text-fg">Send this to your co-signers</h2>
							<p class="m-0 text-xs text-fg-3">
								They paste it under Release keys, check it on their copy and sign.
							</p>
							<CopyField value={current.proposal} label="Proposal" />
						</div>
					{/if}

					{#if current.signedByMe && data.responses[current.id] && !current.mine}
						<div class="flex flex-col gap-2">
							<h2 class="m-0 text-base font-semibold text-fg">Your signature</h2>
							<p class="m-0 text-xs text-fg-3">Send it back to whoever proposed this release.</p>
							<CopyField value={data.responses[current.id] ?? ''} label="Your signature" />
						</div>
					{/if}

					<form
						method="POST"
						action="?/respond"
						class="flex flex-col gap-2"
						use:enhance={submitting('respond')}
					>
						<label for="response" class="text-base font-semibold text-fg">Paste a signature</label>
						<input type="hidden" name="id" value={current.id} />
						<div class="flex flex-col gap-2 sm:flex-row">
							<input
								id="response"
								name="response"
								required
								autocomplete="off"
								spellcheck="false"
								placeholder="A co-signer's signature"
								class="min-w-0 flex-1 rounded-[10px] border-0 bg-bg px-3 py-2.5 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
							/>
							<button
								type="submit"
								disabled={busy !== null}
								class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-auto"
							>
								{busy === 'respond' ? 'Checking…' : 'Add signature'}
							</button>
						</div>
					</form>

					<div class="flex flex-wrap items-center gap-2.5">
						<form method="POST" action="?/commit" use:enhance={submitting('commit')}>
							<input type="hidden" name="id" value={current.id} />
							<button
								type="submit"
								disabled={!ready || busy !== null}
								class="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-accent-400 px-5 text-sm font-semibold text-accent-900 shadow-[0_8px_28px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300 disabled:cursor-default disabled:bg-surface-4 disabled:text-fg-3 disabled:shadow-none"
							>
								{busy === 'commit' ? 'Committing…' : `Commit ${current.release?.name ?? ''}`}
							</button>
						</form>
						{#if !ready}
							<span class="text-xs text-fg-3">
								{key.quorum - current.signed.length} more
								{key.quorum - current.signed.length === 1 ? 'signature' : 'signatures'} to commit
							</span>
						{/if}
						{#if current.mine}
							<form
								method="POST"
								action="?/withdraw"
								class="ml-auto"
								use:enhance={submitting('withdraw')}
							>
								<input type="hidden" name="id" value={current.id} />
								<button
									type="submit"
									disabled={busy !== null}
									class="h-11 cursor-pointer rounded-[10px] px-3.5 text-[13px] font-medium text-apricot-300 ring-1 ring-apricot-400/35 ring-inset hover:bg-apricot-400/8"
								>
									Withdraw {current.release?.name ?? ''}
								</button>
							</form>
						{/if}
					</div>
					{#if actionError}
						<p class="m-0 text-sm text-red-400" role="alert">{actionError}</p>
					{/if}
				</section>
			{:else}
				<section
					aria-label="Propose a release"
					class="flex flex-col gap-3 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
				>
					<h2 class="m-0 text-xl font-semibold text-fg">Propose a release</h2>
					{#if !key.repo}
						<p class="m-0 text-sm text-fg-2">
							This device doesn't have the repo these releases come from yet. Add it to your library
							to propose from its tags.
						</p>
					{:else if data.tags.length === 0}
						<p class="m-0 text-sm text-fg-2">
							No tags in <a href="/{key.repo.name}">{key.repo.name}</a> yet. Push a tag, then propose
							it here.
						</p>
					{:else}
						<p class="m-0 text-sm text-fg-2">
							Pick a tag from <span class="font-mono text-fg">{key.repo.name}</span>. Gear fills in
							its commit, tree and the repo length, mirrors the proposal to your blind peers, and
							signs it for you if you're a signer.
						</p>
						<form
							method="POST"
							action="?/propose"
							class="flex flex-col gap-2 sm:flex-row"
							use:enhance={submitting('propose')}
						>
							<label class="sr-only" for="tag">Tag</label>
							<select
								id="tag"
								name="tag"
								class="h-11 min-w-0 flex-1 rounded-[10px] border-0 bg-bg px-2.5 font-mono text-sm text-fg ring-1 ring-line-strong ring-inset focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
							>
								{#each data.tags as tag (tag)}
									<option value={tag}>{tag}</option>
								{/each}
							</select>
							<button
								type="submit"
								disabled={busy !== null}
								class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-accent-400 px-5 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-300 disabled:opacity-60"
							>
								{busy === 'propose' ? 'Proposing…' : 'Propose release'}
							</button>
						</form>
					{/if}
					{#if actionError}
						<p class="m-0 text-sm text-red-400" role="alert">{actionError}</p>
					{/if}
				</section>
			{/if}
		</div>

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
				<div class="flex gap-3.5">
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
				</div>
			{/if}
			{#each data.history as r (r.index)}
				<div class="flex gap-3.5">
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
				</div>
			{:else}
				{#if !current}
					<p class="m-0 text-sm text-fg-3">Nothing signed yet.</p>
				{/if}
			{/each}
		</aside>
	</div>
</main>
