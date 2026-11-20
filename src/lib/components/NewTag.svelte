<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	// A lightweight tag on a branch head or a commit, made through the Tags
	// tab's action so any page can offer it. Pass `commit` to tag that commit.
	let {
		repoName,
		branches = [],
		head = null,
		commit = null
	}: {
		repoName: string;
		branches?: string[];
		head?: string | null;
		commit?: string | null;
	} = $props();

	const COMMIT = '\u0000commit';

	let name = $state('');
	let branch = $state(untrack(() => head ?? branches[0] ?? COMMIT));
	let oid = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let created = $state<string | null>(null);

	const target = $derived(commit ?? (branch === COMMIT ? oid.trim() : branch));
	const field =
		'h-11 min-w-0 rounded-[10px] border-0 bg-bg px-3 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none';
</script>

<form
	method="POST"
	action="/{encodeURIComponent(repoName)}/tags?/tag"
	class="flex flex-col gap-2"
	use:enhance={() => {
		busy = true;
		error = null;
		created = null;
		return async ({ result }) => {
			busy = false;
			if (result.type === 'success') {
				created = name.trim();
				name = '';
				await invalidateAll();
			} else if (result.type === 'failure') {
				error = (result.data?.tag as { error?: string } | undefined)?.error ?? 'Tagging failed';
			} else if (result.type === 'error') {
				error = result.error?.message ?? 'Tagging failed';
			}
		};
	}}
>
	<input type="hidden" name="target" value={target} />
	<div class="flex flex-col gap-2 sm:flex-row">
		<label class="sr-only" for="tag-name">Tag name</label>
		<input
			id="tag-name"
			name="name"
			bind:value={name}
			required
			autocomplete="off"
			spellcheck="false"
			placeholder="v1.0.0"
			class="{field} sm:flex-[1_1_160px]"
		/>
		{#if !commit}
			<label class="sr-only" for="tag-target">Tag what</label>
			<select id="tag-target" bind:value={branch} class="{field} px-2.5 sm:flex-[1_1_160px]">
				{#each branches as b (b)}
					<option value={b}>{b}{b === head ? ' · default' : ''}</option>
				{/each}
				<option value={COMMIT}>A commit…</option>
			</select>
			{#if branch === COMMIT}
				<label class="sr-only" for="tag-commit">Commit id</label>
				<input
					id="tag-commit"
					bind:value={oid}
					required
					autocomplete="off"
					spellcheck="false"
					pattern={'[0-9a-f]{40}'}
					title="The full 40-character commit id"
					placeholder="Full commit id"
					class="{field} sm:flex-[2_1_240px]"
				/>
			{/if}
		{/if}
		<button
			type="submit"
			disabled={busy || !name.trim() || !target}
			class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-accent-400 px-4 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-300 disabled:cursor-default disabled:opacity-50"
		>
			{busy ? 'Tagging…' : 'Create tag'}
		</button>
	</div>
	{#if error}
		<p class="m-0 text-sm text-red-400" role="alert">{error}</p>
	{:else if created}
		<p class="m-0 text-sm text-accent-300" role="status">
			Tagged <a href="/{repoName}/{created}/" class="font-mono">{created}</a>
		</p>
	{/if}
</form>
