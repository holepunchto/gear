<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import type { Candidates, KeySummary } from '$lib/releases';

	// Propose one of the repo's tags, or on a repo this device owns, make a
	// new tag and propose it in one go. Posts to the key page's actions.
	let { key, candidates }: { key: KeySummary; candidates: Candidates | null } = $props();

	const unreleased = $derived(candidates?.tags.filter((t) => t.released === null) ?? []);

	let tag = $state(untrack(() => candidates?.tags[0]?.name ?? ''));
	let name = $state('');
	let branch = $state(untrack(() => candidates?.head ?? candidates?.branches[0] ?? ''));
	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (candidates && !candidates.tags.some((t) => t.name === tag)) {
			tag = candidates.tags[0]?.name ?? '';
		}
	});

	function submitting(action: string) {
		return () => {
			busy = action;
			error = null;
			return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
				busy = null;
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

<section
	aria-label="Propose a release"
	class="flex flex-col gap-3 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
>
	<h2 class="m-0 text-xl font-semibold text-fg">Propose a release</h2>
	{#if !key.repo || !candidates}
		<p class="m-0 text-sm text-fg-2">
			This device doesn't have the repo these releases come from yet. Add it to your library to
			propose from its tags.
		</p>
	{:else}
		{#if candidates.tags.length > 0}
			<p class="m-0 text-sm text-fg-2">
				Pick a tag from <a href="/{candidates.repo}/tags" class="font-mono">{candidates.repo}</a>.
				Gear fills in its commit, tree and the repo length, mirrors the proposal to your blind
				peers, and signs it for you if you're a signer.
			</p>
			<form
				method="POST"
				action="/releases/{key.key}?/propose"
				class="flex flex-col gap-2 sm:flex-row"
				use:enhance={submitting('propose')}
			>
				<label class="sr-only" for="tag-{key.key}">Tag</label>
				<select id="tag-{key.key}" name="tag" bind:value={tag} class="{field} flex-1 px-2.5">
					{#each candidates.tags as t (t.name)}
						<option value={t.name}>
							{t.name}{t.released === null ? '' : ` · released #${t.released}`}
						</option>
					{/each}
				</select>
				<button type="submit" disabled={busy !== null} class={primary}>
					{busy === 'propose' ? 'Proposing…' : 'Propose release'}
				</button>
			</form>
			{#if unreleased.length === 0}
				<p class="m-0 text-xs text-fg-3">Every tag in {candidates.repo} is already released.</p>
			{/if}
		{:else}
			<p class="m-0 text-sm text-fg-2">
				No tags in <a href="/{candidates.repo}/tags" class="font-mono">{candidates.repo}</a> yet.
			</p>
		{/if}

		{#if candidates.writable}
			<form
				method="POST"
				action="/releases/{key.key}?/proposeNew"
				class="flex flex-col gap-2 border-t border-white/4 pt-3"
				use:enhance={submitting('proposeNew')}
			>
				<span class="text-sm font-semibold text-fg">
					{candidates.tags.length > 0
						? 'Or tag a branch and propose it'
						: 'Tag a branch and propose it'}
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
					<button type="submit" disabled={busy !== null || !name.trim() || !branch} class={primary}>
						{busy === 'proposeNew' ? 'Proposing…' : 'Tag & propose'}
					</button>
				</div>
			</form>
		{:else if unreleased.length === 0}
			<p class="m-0 text-sm text-fg-2">
				You don't own {candidates.repo}, so its owner has to push the next tag. It shows up here
				once they do.
			</p>
		{/if}
	{/if}
	{#if error}
		<p class="m-0 text-sm text-red-400" role="alert">{error}</p>
	{/if}
</section>
