<script lang="ts">
	let { value, label }: { value: string; label: string } = $props();

	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {}
	}
</script>

<div class="flex flex-col gap-2 rounded-xl bg-bg p-3 ring-1 ring-line-strong ring-inset">
	<code
		class="font-mono text-[11.5px] leading-relaxed break-all text-accent-200"
		aria-label={label}
	>
		{value}
	</code>
	<button
		type="button"
		onclick={copy}
		class="inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 self-stretch rounded-[10px] bg-accent-400/14 px-3 text-sm font-semibold text-accent-300 transition-colors hover:bg-accent-400/22 sm:h-9 sm:self-end"
	>
		{copied ? 'Copied' : 'Copy'}
	</button>
</div>
