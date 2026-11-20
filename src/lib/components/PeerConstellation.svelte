<script lang="ts">
	// You in the middle, one node per connected peer around you. Driven by
	// counts only: we don't know who the peers are, so positions are just an
	// even spread, not a map of anything. Blind peers draw hollow with a
	// dashed link.
	let {
		peers,
		blind = 0,
		width = 132,
		height = 112,
		label
	}: { peers: number; blind?: number; width?: number; height?: number; label: string } = $props();

	const MAX = 10;

	const nodes = $derived.by(() => {
		const shown = Math.min(peers + blind, MAX);
		const solid = Math.min(peers, shown);
		const cx = width / 2;
		const cy = height / 2;
		const out: { x: number; y: number; blind: boolean }[] = [];
		for (let i = 0; i < shown; i++) {
			const a = -Math.PI / 2 + (i / shown) * Math.PI * 2 + 0.35;
			const r = i % 2 ? 0.86 : 1;
			out.push({
				x: cx + Math.cos(a) * (cx - 10) * r,
				y: cy + Math.sin(a) * (cy - 10) * r,
				blind: i >= solid
			});
		}
		return out;
	});
</script>

<svg
	{width}
	{height}
	viewBox="0 0 {width} {height}"
	role="img"
	aria-label={label}
	class="flex-none"
>
	<g stroke="rgb(93 221 173 / 0.35)" stroke-width="1">
		{#each nodes as n, i (i)}
			<line
				x1={width / 2}
				y1={height / 2}
				x2={n.x}
				y2={n.y}
				stroke-dasharray={n.blind ? '3 3' : undefined}
			/>
		{/each}
	</g>
	<circle
		cx={width / 2}
		cy={height / 2}
		r="16"
		fill={peers + blind > 0 ? 'rgb(35 204 148 / 0.15)' : 'rgb(255 255 255 / 0.04)'}
	/>
	<circle cx={width / 2} cy={height / 2} r="7" fill={peers + blind > 0 ? '#23cc94' : '#526159'} />
	{#each nodes as n, i (i)}
		{#if n.blind}
			<circle cx={n.x} cy={n.y} r="5" fill="none" stroke="#5dddad" stroke-width="1.5" />
		{:else}
			<circle cx={n.x} cy={n.y} r="5" fill="#5dddad" />
		{/if}
	{/each}
</svg>
