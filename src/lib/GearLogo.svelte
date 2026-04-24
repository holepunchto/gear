<script lang="ts">
	// Monogram G with a small pear stem + leaf above-right.
	// Uses currentColor so Tailwind text-* utilities control the fill.
	let { size = 28, class: klass = '' }: { size?: number; class?: string } = $props();
</script>

<svg
	viewBox="0 0 32 32"
	width={size}
	height={size}
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	class={klass}
	aria-hidden="true"
>
	<!-- G glyph: open circle with crossbar -->
	<path
		d="M 24 10 A 8 8 0 1 0 24 22 L 24 17 L 19 17"
		stroke="currentColor"
		stroke-width="3.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<!-- Stem angling up-right from the top of the G -->
	<path
		d="M 19 5.5 L 23 2.5"
		stroke="currentColor"
		stroke-width="2.2"
		stroke-linecap="round"
	/>
	<!-- Leaf at the tip of the stem -->
	<path
		d="M 23 2.5 C 26 1, 29 2, 29 4.5 C 26 4.5, 24 4, 23 2.5 Z"
		fill="currentColor"
	/>
</svg>
