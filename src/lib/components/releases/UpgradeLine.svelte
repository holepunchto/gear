<script lang="ts">
	// The package.json line that moves installed copies of an app to `link`,
	// with a copy button.
	let { link }: { link: string } = $props();

	const line = $derived(`"upgrade": "${link}"`);
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(line);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {}
	}
</script>

<div
	class="flex items-center gap-2 rounded-[10px] bg-bg px-3 py-2 ring-1 ring-line-strong ring-inset"
>
	<code class="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={line}>{line}</code>
	<button
		type="button"
		onclick={copy}
		aria-label="Copy the upgrade line"
		class="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-[7px] bg-surface-4 px-2.5 text-xs font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 sm:h-7"
	>
		{copied ? 'Copied' : 'Copy'}
	</button>
</div>
