<script lang="ts">
	// How much of the repo's core is held locally, from contiguousLength /
	// length. Mint when complete, apricot while catching up; it only glows
	// while peers are connected. An empty core (nothing pushed or replicated
	// yet) draws an empty ring.
	let { length, contiguous, peers }: { length: number; contiguous: number; peers: number } =
		$props();

	const C = 2 * Math.PI * 18;
	const pct = $derived(
		length === 0 ? 0 : Math.floor((Math.min(contiguous, length) / length) * 100)
	);
	const syncing = $derived(contiguous < length);
	const color = $derived(syncing ? '#fb923c' : '#23cc94');
</script>

<svg
	width="44"
	height="44"
	viewBox="0 0 44 44"
	role="img"
	aria-label="{pct}% of blocks held locally"
	class="flex-none"
>
	<circle cx="22" cy="22" r="18" fill="none" stroke="#1a2620" stroke-width="4" />
	{#if pct > 0}
		<circle
			cx="22"
			cy="22"
			r="18"
			fill="none"
			stroke={color}
			stroke-width="4"
			stroke-linecap="round"
			stroke-dasharray="{((C * pct) / 100).toFixed(1)} {C.toFixed(1)}"
			transform="rotate(-90 22 22)"
			style:filter={peers > 0
				? `drop-shadow(0 0 4px ${syncing ? 'rgb(251 146 60 / 0.7)' : 'rgb(35 204 148 / 0.7)'})`
				: undefined}
			class="transition-[stroke-dasharray] duration-500"
		/>
	{/if}
	<circle cx="22" cy="22" r="4" fill={peers > 0 ? color : '#526159'} />
</svg>
