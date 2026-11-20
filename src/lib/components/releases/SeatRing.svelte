<script lang="ts">
	// The threshold as a ring of seats: m lit out of n.
	let { m, n, size = 64 }: { m: number; n: number; size?: number } = $props();

	const seats = $derived(
		Array.from({ length: n }, (_, i) => {
			const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
			return { x: 32 + 24 * Math.cos(a), y: 32 + 24 * Math.sin(a), on: i < m };
		})
	);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 64 64"
	role="img"
	aria-label="{m} of {n} signers must sign"
	class="flex-none"
>
	{#each seats as s, i (i)}
		<circle
			cx={s.x}
			cy={s.y}
			r="7"
			fill={s.on ? '#23cc94' : '#0c1410'}
			stroke={s.on ? '#5dddad' : '#407e62'}
			stroke-width="1.5"
			style={s.on ? 'filter: drop-shadow(0 0 4px #23cc94)' : ''}
		/>
	{/each}
	<text
		x="32"
		y="37"
		text-anchor="middle"
		fill="#e8f1ec"
		font-family="Space Grotesk"
		font-weight="600"
		font-size="14">{m}/{n}</text
	>
</svg>
