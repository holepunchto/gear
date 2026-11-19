<script lang="ts" module>
	export type Activity = { id: number; text: string; at: number };
</script>

<script lang="ts">
	import { ago } from '$lib/time';

	let { items, now }: { items: Activity[]; now: number } = $props();
</script>

<section
	aria-label="Live activity"
	class="rounded-2xl bg-surface p-[18px] ring-1 ring-line ring-inset"
>
	<h2 class="m-0 mb-3.5 font-sans text-xs font-semibold tracking-[0.08em] text-fg-3 uppercase">
		Live activity
	</h2>
	{#if items.length === 0}
		<p class="m-0 text-[13px] leading-relaxed text-fg-3">
			Nothing yet this session. New blocks and peers show up here as they happen.
		</p>
	{:else}
		<ol class="m-0 flex list-none flex-col gap-3.5 p-0">
			{#each items as item (item.id)}
				{@const live = now - item.at < 60_000}
				<li class="flex items-start gap-3">
					<span
						aria-hidden="true"
						class="mt-[5px] h-2 w-2 flex-none rounded-full {live
							? 'bg-accent-400 shadow-glow-strong'
							: 'bg-pear-700'}"
					></span>
					<div class="flex min-w-0 flex-col gap-0.5">
						<span class="text-[13px] text-fg">{item.text}</span>
						<span class="text-xs text-fg-3">{ago(item.at, now)}</span>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>
