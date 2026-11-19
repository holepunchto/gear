<script lang="ts">
	let { n, filled, size = 6 }: { n: number; filled: number; size?: number } = $props();
</script>

<span class="inline-flex gap-[3px]" role="img" aria-label="{filled} of {n} signed">
	{#each { length: n }, i}
		<span
			class="rounded-full {i < filled
				? 'bg-accent-400 shadow-[0_0_5px_#23cc94]'
				: 'shadow-[inset_0_0_0_1.5px_var(--color-pear-500)]'}"
			style="width: {size}px; height: {size}px"
		></span>
	{/each}
</span>
