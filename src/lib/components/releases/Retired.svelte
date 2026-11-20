<script lang="ts">
	import { enhance } from '$app/forms';
	import UpgradeLine from './UpgradeLine.svelte';
	import { shortKey, type KeySummary } from '$lib/releases';

	// A key replaced by a new one that still has a last release to make: the
	// one whose package.json points installed copies at the new key. Then it
	// is revoked.
	let { key }: { key: KeySummary } = $props();

	let busy = $state(false);

	const to = $derived(key.retiredTo!);
	const repo = $derived(key.repo?.name ?? key.name.split('/')[0]);

	function submit() {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	}
</script>

<section
	aria-label="Retired"
	class="flex flex-col gap-3 rounded-2xl bg-surface px-5 py-4 ring-1 ring-apricot-400/35 ring-inset"
>
	<div class="flex flex-col gap-1">
		<a
			href="/releases/{to}"
			class="font-display text-lg font-semibold text-apricot-300 no-underline hover:underline"
		>
			Retired: replaced by <span class="font-mono text-base">{shortKey(to)}</span> →
		</a>
		<span class="text-sm leading-normal text-fg-2">
			It no longer shows as {repo}'s release. Installed copies follow
			<code class="font-mono">upgrade</code> in package.json, so release one more version here with this
			line, then revoke this key.
		</span>
	</div>
	<UpgradeLine link="git+pear://{to}/{repo}" />
	<form method="POST" action="/releases/{key.key}?/revoke" use:enhance={submit}>
		<button
			type="submit"
			disabled={busy}
			class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-9"
		>
			{busy ? 'Revoking…' : 'Revoke now'}
		</button>
	</form>
</section>
