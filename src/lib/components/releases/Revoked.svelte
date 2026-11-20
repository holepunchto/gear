<script lang="ts">
	import type { KeySummary } from '$lib/releases';

	// A key this device no longer trusts. Its history stays below, behind
	// this warning.
	let { key }: { key: KeySummary } = $props();
</script>

<section
	aria-label="Revoked"
	role="alert"
	class="flex flex-col gap-1.5 rounded-2xl bg-red-500/8 px-5 py-4 ring-1 ring-red-400/40 ring-inset"
>
	<span class="font-display text-lg font-semibold text-red-300">Revoked: don't trust this key</span>
	<span class="text-sm leading-normal text-fg-2">
		{#if key.role === 'follower'}
			You marked <span class="font-mono text-fg">{key.name}</span> as revoked. Ask its signers for their
			new key.
		{:else}
			You rotated <span class="font-mono text-fg">{key.name}</span> to new signers on this device.
		{/if}
		Gear doesn't use it for badges, the Clone menu, Discover or the latest release, and nobody here can
		propose or sign on it. Anything signed with it may not come from its signers.
	</span>
</section>
