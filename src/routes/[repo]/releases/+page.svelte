<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import SeatDots from '$lib/components/releases/SeatDots.svelte';
	import SignerList from '$lib/components/releases/SignerList.svelte';
	import Threshold from '$lib/components/releases/Threshold.svelte';
	import CollectSignatures from '$lib/components/releases/CollectSignatures.svelte';
	import ProposeForm from '$lib/components/releases/ProposeForm.svelte';
	import ReleaseLog from '$lib/components/releases/ReleaseLog.svelte';
	import { liveReleases, shortKey, signerName, type DraftSigner } from '$lib/releases';

	let { data, form }: PageProps = $props();

	onMount(liveReleases);

	// The repo is implied here, so setting up a key is name, signers and
	// threshold.
	let name = $state(untrack(() => `${data.repo.name}/stable`));
	let signers = $state<DraftSigner[]>([{ key: untrack(() => data.seat), label: '', me: true }]);
	let quorum = $state(1);
	let creating = $state(false);
</script>

{#if data.keys.length === 0}
	<form
		method="POST"
		action="?/createKey"
		class="flex flex-col gap-5"
		use:enhance={() => {
			creating = true;
			return async ({ update }) => {
				await update({ reset: false });
				creating = false;
			};
		}}
	>
		<section
			aria-label="Name"
			class="flex flex-col gap-3.5 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
		>
			<div class="flex flex-col gap-1.5">
				<h2 class="m-0 text-xl font-semibold text-fg">Set up signed releases</h2>
				<p class="m-0 max-w-2xl text-sm text-fg-2">
					A release key is a signed log of {data.repo.name}'s releases. You pick who signs and how
					many must agree before a tag becomes a release.
				</p>
			</div>
			<div class="flex flex-wrap items-end gap-3.5">
				<label class="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5 text-xs text-fg-2">
					Name
					<input
						name="name"
						bind:value={name}
						required
						autocomplete="off"
						spellcheck="false"
						class="h-11 rounded-[10px] border-0 bg-bg px-3 font-mono text-sm text-fg ring-1 ring-line-strong ring-inset focus:ring-2 focus:ring-accent-400/50 focus:outline-none sm:h-10"
					/>
				</label>
				<span class="flex h-11 items-center gap-2 text-[13px] text-fg-2 sm:h-10">
					<span
						class="flex h-6 w-6 items-center justify-center rounded-full bg-accent-400/16 text-xs font-semibold text-accent-300"
						aria-hidden="true">✓</span
					>
					Releases come from <span class="font-mono text-fg">{data.repo.name}</span> tags
				</span>
			</div>
		</section>

		<SignerList bind:signers bind:quorum />

		<Threshold bind:quorum n={signers.length} />

		<div class="flex flex-wrap items-center gap-3">
			<button
				type="submit"
				disabled={creating || !name.trim()}
				class="h-12 cursor-pointer rounded-xl bg-accent-400 px-6 text-[15px] font-semibold text-accent-900 shadow-[0_10px_30px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300 disabled:cursor-default disabled:opacity-50"
			>
				{creating ? 'Creating…' : 'Create release key'}
			</button>
			{#if form?.create && 'error' in form.create}
				<p class="m-0 text-sm text-red-400" role="alert">{form.create.error}</p>
			{/if}
		</div>
	</form>
{:else}
	<div class="flex flex-col gap-8">
		{#each data.keys as d (d.key.key)}
			{@const key = d.key}
			{@const current = key.pending[0] ?? null}
			<article class="flex flex-col gap-4" aria-label="{key.name} releases">
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
					<span class="min-w-0 flex-[1_1_200px] truncate text-xs text-fg-2">
						{key.signers.map((s) => (s.me ? 'You' : signerName(s))).join(', ')}
					</span>
					<a
						href="/releases/{key.key}"
						class="tap-44 ml-auto text-[13px] font-medium text-accent-300 no-underline hover:underline"
					>
						Key page <span class="font-mono text-fg-3">{shortKey(key.key)}</span> →
					</a>
				</header>

				<div class="flex flex-wrap items-start gap-6">
					<div class="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
						{#if current}
							<div
								class="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-surface px-5 py-4 ring-1 ring-line ring-inset"
							>
								<span class="text-fg-2">
									<b class="font-display text-lg font-semibold text-apricot-300">
										{current.release?.name ?? 'A release'}
									</b>
									is collecting signatures ·
									<a href="/releases/{key.key}/{current.id}">review</a>
								</span>
								<span class="text-[13px]">
									<b class="font-display text-lg font-semibold">{current.signed.length}</b>
									<span class="text-fg-3">of {key.quorum} needed</span>
								</span>
							</div>
							<CollectSignatures {key} {current} response={d.responses[current.id] ?? null} />
						{:else}
							<ProposeForm {key} candidates={d.candidates} />
						{/if}
					</div>
					<ReleaseLog {key} {current} history={d.history} changes={d.changes} />
				</div>
			</article>
		{/each}
	</div>
{/if}
