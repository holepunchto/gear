<script lang="ts">
	import { enhance } from '$app/forms';
	import { shortKey, type KeySummary } from '$lib/releases';

	// A retired key: where its release log went, and archiving it in one
	// click since it takes no more releases.
	let { key }: { key: KeySummary } = $props();

	let busy = $state(false);

	const to = $derived(key.rotatedTo!);
	const name = $derived(to.name ?? shortKey(to.to));

	function submit() {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	}
</script>

<section
	aria-label="Rotated"
	class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-surface px-5 py-4 ring-1 ring-accent-300/25 ring-inset"
>
	<div class="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
		{#if to.known}
			<a
				href="/releases/{to.to}"
				class="font-display text-lg font-semibold text-accent-300 no-underline hover:underline"
			>
				Rotated to <span class="font-mono text-base">{name}</span> →
			</a>
		{:else}
			<span class="font-display text-lg font-semibold text-fg">
				Rotated to <span class="font-mono text-base" title={to.to}>{name}</span>
			</span>
		{/if}
		<span class="text-xs text-fg-3">
			Its signers handed this release log over to a new key. It takes no more releases; its history
			stays here.
		</span>
	</div>
	{#if !to.known}
		<form method="POST" action="/releases?/follow" use:enhance={submit}>
			<input type="hidden" name="key" value={to.to} />
			<button
				type="submit"
				disabled={busy}
				class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-9"
			>
				{busy ? 'Finding it…' : 'Follow the new key'}
			</button>
		</form>
	{/if}
	{#if !key.archived}
		<form method="POST" action="/releases/{key.key}?/archive" use:enhance={submit}>
			<button
				type="submit"
				disabled={busy}
				class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] px-4 text-sm font-medium text-fg-2 ring-1 ring-line-strong ring-inset hover:text-fg disabled:opacity-60 sm:h-9"
			>
				Archive this key
			</button>
		</form>
	{/if}
</section>
