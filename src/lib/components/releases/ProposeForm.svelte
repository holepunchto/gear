<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import type { Candidates, KeySummary } from '$lib/releases';

	// Release a new version: propose a tag newer than the latest release, an
	// older one from behind a fold, or on a repo this device owns, make a new
	// tag and propose it in one go, then open its flow. On a key this device
	// signs alone it is signed and published in the same go. Posts to the
	// actions of the repo's Releases tab, which redirect to the release.
	let { key, candidates }: { key: KeySummary; candidates: Candidates | null } = $props();

	let tag = $state(untrack(() => candidates?.tags[0] ?? ''));
	let older = $state(untrack(() => candidates?.older[0] ?? ''));
	let name = $state('');
	let branch = $state(untrack(() => candidates?.head ?? candidates?.branches[0] ?? ''));
	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);
	// Your seat is a pear key: proposing signs with it, given its password.
	const pear = $derived(key.signAs !== null && key.signers.some((s) => s.me));
	// Only your signature is needed: proposing releases it.
	const alone = $derived(key.quorum === 1 && key.signers.some((s) => s.me));
	let password = $state('');
	// Releasing alone with a pear key needs its password first.
	const locked = $derived(alone && pear && !password);

	$effect(() => {
		if (candidates && !candidates.tags.includes(tag)) tag = candidates.tags[0] ?? '';
		if (candidates && !candidates.older.includes(older)) older = candidates.older[0] ?? '';
	});

	function submitting(action: string) {
		return () => {
			busy = action;
			error = null;
			return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
				busy = null;
				password = '';
				if (result.type === 'failure') {
					error = (result.data?.propose as { error?: string } | undefined)?.error ?? 'Failed';
				} else if (result.type === 'error') {
					error = result.error?.message ?? 'Failed';
				} else {
					await update();
				}
			};
		};
	}

	const field =
		'h-11 min-w-0 rounded-[10px] border-0 bg-bg px-3 font-mono text-sm text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none';
	const primary =
		'inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-accent-400 px-5 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-300 disabled:cursor-default disabled:opacity-60';
</script>

<div class="flex flex-col gap-3">
	{#if pear && candidates}
		<label class="flex flex-col gap-1.5 text-xs text-fg-2">
			<span>
				Password for your pear key <span class="font-mono text-fg">{key.signAs}</span>, to sign what
				you propose.{alone ? '' : ' Leave it empty to sign later.'}
			</span>
			<input
				type="password"
				bind:value={password}
				autocomplete="off"
				class="{field} font-sans sm:max-w-[320px]"
			/>
		</label>
	{/if}
	{#if !key.repo || !candidates}
		<p class="m-0 text-sm text-fg-2">
			This device doesn't have the repo these releases come from yet. Add it to your library to
			propose from its tags.
		</p>
	{:else}
		{#if candidates.tags.length > 0}
			<p class="m-0 text-sm text-fg-2">
				Pick a tag from <a href="/{candidates.repo}/tags" class="font-mono">{candidates.repo}</a>.
				{alone
					? 'You are the only signer needed, so Gear signs it and publishes it in one go.'
					: "Gear fills in its commit, tree and the repo length, signs it for you if you're a signer, and walks you through collecting the other signatures."}
			</p>
			<form
				method="POST"
				action="?/propose"
				class="flex flex-col gap-2 sm:flex-row"
				use:enhance={submitting('propose')}
			>
				<input type="hidden" name="key" value={key.key} />
				{#if pear}<input type="hidden" name="password" value={password} />{/if}
				<label class="sr-only" for="tag-{key.key}">Tag</label>
				<select id="tag-{key.key}" name="tag" bind:value={tag} class="{field} flex-1 px-2.5">
					{#each candidates.tags as t (t)}
						<option value={t}>{t}</option>
					{/each}
				</select>
				<button type="submit" disabled={busy !== null || locked} class={primary}>
					{busy === 'propose'
						? alone
							? 'Releasing…'
							: 'Proposing…'
						: alone
							? `Sign & release ${tag}`
							: `Propose ${tag}`}
				</button>
			</form>
		{:else if candidates.latest}
			<p class="m-0 text-sm text-fg-2">
				Up to date: <span class="font-mono text-fg">{candidates.latest.tag}</span> is the latest tag and
				it's released.
			</p>
		{:else}
			<p class="m-0 text-sm text-fg-2">
				No tags in <a href="/{candidates.repo}/tags" class="font-mono">{candidates.repo}</a> yet.
			</p>
		{/if}

		{#if candidates.writable}
			<form
				method="POST"
				action="?/proposeNew"
				class="flex flex-col gap-2 border-t border-white/4 pt-3"
				use:enhance={submitting('proposeNew')}
			>
				<input type="hidden" name="key" value={key.key} />
				{#if pear}<input type="hidden" name="password" value={password} />{/if}
				<span class="text-sm font-semibold text-fg">
					{candidates.tags.length > 0 ? 'Or tag a branch' : 'Tag a branch'}
				</span>
				<div class="flex flex-col gap-2 sm:flex-row">
					<label class="sr-only" for="new-tag-{key.key}">New tag</label>
					<input
						id="new-tag-{key.key}"
						name="name"
						bind:value={name}
						required
						autocomplete="off"
						spellcheck="false"
						placeholder="v1.0.0"
						class="{field} sm:flex-1"
					/>
					<label class="sr-only" for="new-target-{key.key}">At the head of</label>
					<select
						id="new-target-{key.key}"
						name="target"
						bind:value={branch}
						class="{field} px-2.5 sm:flex-1"
					>
						{#each candidates.branches as b (b)}
							<option value={b}>{b}{b === candidates.head ? ' · default' : ''}</option>
						{/each}
					</select>
					<button
						type="submit"
						disabled={busy !== null || locked || !name.trim() || !branch}
						class={primary}
					>
						{busy === 'proposeNew'
							? alone
								? 'Releasing…'
								: 'Proposing…'
							: alone
								? 'Tag, sign & release'
								: 'Tag & propose'}
					</button>
				</div>
			</form>
		{:else if candidates.tags.length === 0}
			<p class="m-0 text-sm text-fg-2">
				You don't own {candidates.repo}, so its owner has to push the next tag. It shows up here
				once they do.
			</p>
		{/if}
	{/if}
	{#if candidates && candidates.older.length > 0}
		<details class="group border-t border-white/4 pt-3">
			<summary
				class="flex min-h-11 cursor-pointer list-none items-center text-[13px] font-medium text-fg-2 hover:text-fg"
			>
				Release an older tag…
			</summary>
			<form
				method="POST"
				action="?/propose"
				class="flex flex-col gap-2"
				use:enhance={submitting('propose')}
			>
				<input type="hidden" name="key" value={key.key} />
				{#if pear}<input type="hidden" name="password" value={password} />{/if}
				<p class="m-0 text-xs text-apricot-300">
					These are older than {candidates.latest?.name ?? 'the latest release'}, the latest
					release. Releasing one puts an older version after it in the log.
				</p>
				<div class="flex flex-col gap-2 sm:flex-row">
					<label class="sr-only" for="older-{key.key}">Older tag</label>
					<select id="older-{key.key}" name="tag" bind:value={older} class="{field} flex-1 px-2.5">
						{#each candidates.older as t (t)}
							<option value={t}>{t}</option>
						{/each}
					</select>
					<button
						type="submit"
						disabled={busy !== null || locked}
						class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60"
					>
						{alone ? 'Sign & release older' : 'Propose older release'}
					</button>
				</div>
			</form>
		</details>
	{/if}
	{#if error}
		<p class="m-0 text-sm text-red-400" role="alert">{error}</p>
	{/if}
</div>
