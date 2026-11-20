<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import SignerList from './SignerList.svelte';
	import Threshold from './Threshold.svelte';
	import { proposalName, type DraftSigner, type KeySummary } from '$lib/releases';

	// Rotate a key to new signers, archive it, or unarchive it. Archiving is
	// local: the key keeps being seeded, so co-signers and followers lose
	// nothing. A rotated key archives from its Rotated notice instead. Posts
	// to the key page's actions, so it works from any page.
	let { key }: { key: KeySummary } = $props();

	let confirming = $state(false);
	let busy = $state(false);

	let rotating = $state(false);
	let name = $state('');
	let signers = $state<DraftSigner[]>([]);
	let quorum = $state(1);
	let error = $state<string | null>(null);

	const pending = $derived(key.pending[0] ?? null);
	const where = $derived(key.repo ? `${key.repo.name}'s Releases tab` : 'its repo');
	const canRotate = $derived(key.role !== 'follower');

	// The picker starts from the key's name and its signers, this device first.
	function startRotate() {
		name = key.name;
		signers = [...key.signers]
			.sort((a, b) => Number(b.me) - Number(a.me))
			.map((s) => ({ key: s.key, label: s.label ?? '', me: s.me }));
		quorum = key.quorum;
		error = null;
		rotating = true;
	}

	function rotate() {
		busy = true;
		error = null;
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			busy = false;
			if (result.type === 'failure') {
				error =
					(result.data?.rotate as { error?: string } | undefined)?.error ?? 'Something went wrong';
			} else if (result.type === 'error') {
				error = result.error?.message ?? 'Something went wrong';
			} else {
				rotating = false;
				await update();
			}
		};
	}

	function submit() {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
			confirming = false;
		};
	}
</script>

{#if key.archived}
	<form
		method="POST"
		action="/releases/{key.key}?/unarchive"
		use:enhance={submit}
		class="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-5 py-4 ring-1 ring-line ring-inset"
	>
		<span class="min-w-0 flex-[1_1_260px] text-sm text-fg-2">
			<b class="font-semibold text-fg">Archived on this device.</b>
			Its history stays browsable here and Gear keeps seeding it.
		</span>
		<button
			type="submit"
			disabled={busy}
			class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-9"
		>
			{busy ? 'Unarchiving…' : 'Unarchive'}
		</button>
	</form>
{:else if !key.rotatedTo}
	<details class="group rounded-xl bg-surface ring-1 ring-line ring-inset">
		<summary
			class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-fg-2 hover:text-fg"
		>
			Move away from this key
			<span class="text-xs font-normal text-fg-3 group-open:hidden">
				{canRotate ? 'rotate or archive' : 'archive'}
			</span>
		</summary>
		<div class="flex flex-col gap-3 px-4 pb-4">
			{#if canRotate}
				<div class="flex flex-wrap items-start gap-3">
					<div class="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
						<span class="text-sm font-semibold text-fg">Rotate to new signers</span>
						<span class="text-xs leading-normal text-fg-3">
							Makes a new key with the signers you pick, then asks this key's signers ({key.quorum} of
							{key.signers.length}) to sign a last entry that hands the release log over to it.
							Anyone holding this key, followers included, finds the new one from there.
						</span>
					</div>
					{#if !rotating}
						<button
							type="button"
							onclick={startRotate}
							class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 sm:h-9"
						>
							Rotate to new signers…
						</button>
					{/if}
				</div>

				{#if rotating}
					<form
						method="POST"
						action="/releases/{key.key}?/rotate"
						use:enhance={rotate}
						class="flex flex-col gap-4"
					>
						<label class="flex flex-col gap-1.5 text-xs text-fg-2">
							New key name
							<input
								name="name"
								bind:value={name}
								required
								autocomplete="off"
								spellcheck="false"
								class="h-11 rounded-[10px] border-0 bg-bg px-3 font-mono text-sm text-fg ring-1 ring-line-strong ring-inset focus:ring-2 focus:ring-accent-400/50 focus:outline-none sm:h-10"
							/>
						</label>
						<SignerList bind:signers bind:quorum />
						<Threshold bind:quorum n={signers.length} />
						{#if pending}
							<p class="m-0 text-sm leading-normal text-apricot-300" role="alert">
								{proposalName(pending)} is still collecting signatures. Commit or withdraw it first: only
								one entry can come next, and the rotation has to be the last.
							</p>
						{/if}
						<div class="flex flex-wrap items-center gap-2.5">
							<button
								type="submit"
								disabled={busy || !name.trim()}
								class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] bg-accent-400 px-4 text-sm font-semibold text-accent-900 hover:bg-accent-300 disabled:opacity-60"
							>
								{busy ? 'Creating…' : 'Create key and propose rotation'}
							</button>
							<button
								type="button"
								onclick={() => (rotating = false)}
								class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] px-4 text-sm font-medium text-fg-2 hover:text-fg"
							>
								Cancel
							</button>
						</div>
						{#if error}
							<p class="m-0 text-sm text-red-400" role="alert">{error}</p>
						{/if}
					</form>
				{/if}
				<hr class="m-0 border-line" />
			{/if}
			<div class="flex flex-wrap items-start gap-3">
				<div class="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
					<span class="text-sm font-semibold text-fg">Archive</span>
					<span class="text-xs leading-normal text-fg-3">
						Hides <span class="font-mono">{key.name}</span> from {where}, its badges and Your
						releases on this device. Its history stays under Archived on Release keys, and you can
						unarchive it any time.
					</span>
				</div>
				{#if !confirming}
					<button
						type="button"
						onclick={() => (confirming = true)}
						class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 sm:h-9"
					>
						Archive…
					</button>
				{/if}
			</div>

			{#if confirming}
				<form
					method="POST"
					action="/releases/{key.key}?/archive"
					use:enhance={submit}
					class="flex flex-col gap-3 rounded-xl bg-bg p-4 ring-1 ring-line-strong ring-inset"
				>
					<p class="m-0 text-sm leading-normal text-fg-2">
						{#if key.role === 'follower'}
							Gear keeps seeding <span class="font-mono">{key.name}</span>, so other followers can
							still read it. Nothing changes for its signers.
						{:else}
							Gear keeps seeding <span class="font-mono">{key.name}</span>, so co-signers and
							followers lose nothing.
							{key.length ? 'Its releases stay published.' : 'Nothing has been released on it yet.'}
							You can't propose from it while it's archived.
						{/if}
					</p>
					{#if pending}
						<p class="m-0 text-sm leading-normal text-apricot-300" role="alert">
							{proposalName(pending)} is still collecting signatures. Archiving doesn't withdraw it: co-signers
							can still sign it, and anyone holding enough signatures can still commit it.
						</p>
					{/if}
					<div class="flex flex-wrap gap-2.5">
						<button
							type="submit"
							disabled={busy}
							class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] bg-apricot-400 px-4 text-sm font-semibold text-[#2a1405] hover:bg-apricot-300 disabled:opacity-60 sm:h-9"
						>
							{busy ? 'Archiving…' : `Archive ${key.name}`}
						</button>
						<button
							type="button"
							onclick={() => (confirming = false)}
							class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] px-4 text-sm font-medium text-fg-2 hover:text-fg sm:h-9"
						>
							Cancel
						</button>
					</div>
				</form>
			{/if}
		</div>
	</details>
{/if}
