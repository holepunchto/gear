<script lang="ts">
	import CopyButton from './CopyButton.svelte';

	// The package.json line that moves installed copies of an app to `link`,
	// with a copy button.
	let { link }: { link: string } = $props();

	const line = $derived(`"upgrade": "${link}"`);
</script>

<div
	class="flex items-center gap-2 rounded-[10px] bg-bg px-3 py-2 ring-1 ring-line-strong ring-inset"
>
	<code class="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={line}>{line}</code>
	<CopyButton value={line} tone="plain" title="Copy the upgrade line" />
</div>
