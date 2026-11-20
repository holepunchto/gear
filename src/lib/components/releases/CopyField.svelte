<script lang="ts">
	import CopyButton from './CopyButton.svelte';

	// `seal` for what belongs to a signed release; live colours otherwise.
	let { value, label, seal = false }: { value: string; label: string; seal?: boolean } = $props();

	// A proposal runs to several hundred characters: two lines and a toggle,
	// since it is copied, not read.
	const long = $derived(value.length > 120);
	let open = $state(false);
</script>

<div
	class="flex flex-col gap-2 rounded-xl bg-bg p-3 ring-1 ring-inset {seal
		? 'ring-seal-400/30'
		: 'ring-line-strong'}"
>
	<code
		class="font-mono text-[11.5px] leading-relaxed break-all {seal
			? 'text-seal-100'
			: 'text-accent-200'} {long && !open ? 'line-clamp-2' : ''}"
		aria-label={label}
	>
		{value}
	</code>
	<div class="flex flex-wrap items-center justify-end gap-2">
		{#if long}
			<button
				type="button"
				onclick={() => (open = !open)}
				aria-expanded={open}
				class="tap-44 mr-auto cursor-pointer border-0 bg-transparent p-0 text-xs text-fg-3 hover:text-fg"
			>
				{open ? 'Show less' : 'Show all'}
			</button>
		{/if}
		<CopyButton {value} tone={seal ? 'seal' : 'live'} title="Copy {label}" />
	</div>
</div>
