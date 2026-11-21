<script lang="ts">
	import type { Snippet } from 'svelte';

	// On a phone a wide table keeps its natural width and scrolls, rather than
	// being cut off by the card or squeezed to a word per line.
	const { children }: { children?: Snippet } = $props();
</script>

<div class="overflow-x-auto">
	<table class="w-max min-w-full sm:w-full">{@render children?.()}</table>
</div>
