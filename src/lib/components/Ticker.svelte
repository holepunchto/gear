<script lang="ts">
	// A number that ticks into place when it changes. The key block re-mounts
	// the span on change; Svelte skips intro transitions on first render, so
	// the initial value just appears.
	let { value }: { value: number } = $props();

	function tick(_node: Element) {
		return {
			duration: 320,
			css: (t: number) =>
				`display: inline-block; transform: translateY(${(1 - t) * -0.35}em); opacity: ${t}`
		};
	}
</script>

{#key value}<span in:tick>{value.toLocaleString()}</span>{/key}
