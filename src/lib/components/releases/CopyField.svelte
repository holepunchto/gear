<script lang="ts">
	// `seal` for what belongs to a signed release; live colours otherwise.
	let { value, label, seal = false }: { value: string; label: string; seal?: boolean } = $props();

	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {}
	}
</script>

<div
	class="flex flex-col gap-2 rounded-xl bg-bg p-3 ring-1 ring-inset {seal
		? 'ring-seal-400/30'
		: 'ring-line-strong'}"
>
	<code
		class="font-mono text-[11.5px] leading-relaxed break-all {seal
			? 'text-seal-100'
			: 'text-accent-200'}"
		aria-label={label}
	>
		{value}
	</code>
	<button
		type="button"
		onclick={copy}
		class="inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 self-stretch rounded-[10px] px-3 text-sm font-semibold transition-colors sm:h-9 sm:self-end {seal
			? 'bg-seal-400/16 text-seal-200 hover:bg-seal-400/24'
			: 'bg-accent-400/14 text-accent-300 hover:bg-accent-400/22'}"
	>
		{copied ? 'Copied' : 'Copy'}
	</button>
</div>
