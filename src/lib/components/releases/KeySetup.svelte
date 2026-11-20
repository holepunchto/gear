<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import type { DraftSigner, PearKey } from '$lib/releases';
	import SignAs from './SignAs.svelte';
	import SignerList from './SignerList.svelte';
	import Threshold from './Threshold.svelte';

	// A repo's first release starts with its key: who signs and how many must
	// agree. Posts to the Releases tab's createKey action; once the key is
	// there, the tab goes on to the release.
	let { repo, seat, pearKeys }: { repo: string; seat: string; pearKeys: PearKey[] } = $props();

	let name = $state(untrack(() => `${repo}/stable`));
	let signers = $state<DraftSigner[]>([{ key: untrack(() => seat), label: '', me: true }]);
	let quorum = $state(1);
	let busy = $state(false);
	let error = $state<string | null>(null);

	function submit() {
		busy = true;
		error = null;
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			busy = false;
			if (result.type === 'failure') {
				error = (result.data?.createKey as { error?: string } | undefined)?.error ?? 'Failed';
			} else if (result.type === 'error') {
				error = result.error?.message ?? 'Failed';
			} else {
				await update({ reset: false });
			}
		};
	}
</script>

<form method="POST" action="?/createKey" class="flex flex-col gap-4" use:enhance={submit}>
	<p class="m-0 text-sm text-fg-2">
		First, {repo}'s release key: a signed log of its releases. Pick who signs and how many must
		agree before a tag becomes a release. Then pick the tag.
	</p>
	<label class="flex flex-col gap-1.5 text-xs text-fg-2 sm:max-w-[360px]">
		Key name
		<input
			name="name"
			bind:value={name}
			required
			autocomplete="off"
			spellcheck="false"
			class="h-11 rounded-[10px] border-0 bg-bg px-3 font-mono text-sm text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none sm:h-10"
		/>
	</label>

	<SignAs gearKey={seat} {pearKeys} bind:signers />

	<SignerList bind:signers bind:quorum />

	<Threshold bind:quorum n={signers.length} />

	<button
		type="submit"
		disabled={busy || !name.trim()}
		class="inline-flex h-11 cursor-pointer items-center justify-center self-start rounded-[10px] bg-accent-400 px-5 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-300 disabled:cursor-default disabled:opacity-60"
	>
		{busy ? 'Creating…' : 'Create key, then pick the tag'}
	</button>
	{#if error}
		<p class="m-0 text-sm text-red-400" role="alert">{error}</p>
	{/if}
</form>
