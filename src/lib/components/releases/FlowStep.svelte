<script lang="ts">
	import type { Snippet } from 'svelte';

	// One step of a release: a tick and a line once done, open with its body,
	// greyed out while it waits on an earlier one.
	let {
		n,
		title,
		status,
		line = '',
		last = false,
		children
	}: {
		n: number;
		title: string;
		status: 'done' | 'open' | 'todo' | 'skipped';
		line?: string;
		last?: boolean;
		children?: Snippet;
	} = $props();
</script>

<li class="flex gap-3.5" aria-current={status === 'open' ? 'step' : undefined}>
	<div class="flex w-7 flex-none flex-col items-center" aria-hidden="true">
		<span
			class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold {status ===
			'done'
				? 'bg-accent-400 text-accent-900'
				: status === 'open'
					? 'bg-[#16120c] text-apricot-300 shadow-[inset_0_0_0_2px_#fb923c,0_0_12px_rgb(251_146_60/0.35)]'
					: 'bg-surface-2 text-fg-3 ring-1 ring-line ring-inset'}"
		>
			{#if status === 'done'}
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg
				>
			{:else if status === 'skipped'}
				–
			{:else}
				{n}
			{/if}
		</span>
		{#if !last}
			<span class="w-0.5 flex-1 {status === 'done' ? 'bg-accent-400/40' : 'bg-neutral-800'}"></span>
		{/if}
	</div>
	<div class="flex min-w-0 flex-1 flex-col gap-3 {last ? '' : 'pb-6'}">
		<div class="flex min-h-7 flex-col justify-center">
			<span
				class="text-[15px] font-semibold {status === 'open'
					? 'text-apricot-300'
					: status === 'done'
						? 'text-fg'
						: 'text-fg-3'}"
			>
				{title}
			</span>
			{#if line}
				<span class="text-[13px] {status === 'todo' ? 'text-fg-3' : 'text-fg-2'}">{line}</span>
			{/if}
		</div>
		{#if children}
			{@render children()}
		{/if}
	</div>
</li>
