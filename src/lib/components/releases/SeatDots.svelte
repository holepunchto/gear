<script lang="ts">
	import { multisig } from '$lib/releases';

	// `seal` paints the filled seats as a signed release.
	let {
		n,
		filled,
		size = 6,
		seal = false
	}: { n: number; filled: number; size?: number; seal?: boolean } = $props();

	const on = $derived(
		seal
			? multisig(n)
				? 'bg-seal-400 shadow-[0_0_5px_#8b5cf6]'
				: 'bg-seal-400'
			: 'bg-accent-400 shadow-[0_0_5px_#23cc94]'
	);
</script>

<span class="inline-flex gap-[3px]" role="img" aria-label="{filled} of {n} signed">
	{#each { length: n }, i}
		<span
			class="rounded-full {i < filled ? on : 'shadow-[inset_0_0_0_1.5px_var(--color-pear-500)]'}"
			style="width: {size}px; height: {size}px"
		></span>
	{/each}
</span>
