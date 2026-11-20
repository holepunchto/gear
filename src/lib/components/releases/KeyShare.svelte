<script lang="ts">
	import CopyButton from './CopyButton.svelte';

	// Copy a release key, or the share link someone else pastes into
	// "Follow a release key".
	let { keyText, share }: { keyText: string; share: string } = $props();
</script>

<span class="inline-flex flex-wrap items-center gap-1.5">
	<CopyButton value={keyText} label="Copy key" tone="plain" />
	<CopyButton value={share} label="Copy share link" />
</span>
