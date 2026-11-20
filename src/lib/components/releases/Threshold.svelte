<script lang="ts">
	let { quorum = $bindable(), n }: { quorum: number; n: number } = $props();

	$effect(() => {
		if (quorum > n) quorum = n;
	});
</script>

<section
	aria-label="Threshold"
	class="flex flex-wrap items-center gap-6 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
>
	<div class="flex flex-[1_1_280px] flex-col gap-2">
		<h2 class="m-0 text-xl font-semibold text-fg">How many must agree</h2>
		<p class="m-0 leading-normal text-fg-2">
			Higher is safer against a stolen key. Lower keeps releases moving when people are away.
		</p>
	</div>
	<div class="flex flex-wrap items-center gap-4">
		<div
			role="group"
			aria-label="Signatures required"
			class="flex flex-wrap gap-1.5 rounded-[14px] bg-bg p-[5px] ring-1 ring-white/6 ring-inset"
		>
			{#each { length: n }, i}
				<button
					type="button"
					aria-pressed={quorum === i + 1}
					onclick={() => (quorum = i + 1)}
					class="h-14 w-14 cursor-pointer rounded-[10px] font-display text-xl font-semibold transition-colors sm:w-16 {quorum ===
					i + 1
						? 'bg-accent-400 text-accent-900 shadow-[0_0_24px_rgb(35_204_148/0.45)]'
						: 'text-fg-2 hover:text-fg'}">{i + 1}</button
				>
			{/each}
		</div>
		<span class="text-[15px] font-medium text-fg-2">
			of <b class="text-fg">{n}</b>
			{n === 1 ? 'signer' : 'signers'}
		</span>
	</div>
	<input type="hidden" name="quorum" value={quorum} />
	<p
		class="m-0 flex basis-full items-start gap-2.5 rounded-xl bg-bg px-3.5 py-3 text-[13px] leading-normal text-fg-2 ring-1 ring-white/6 ring-inset"
	>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="#5dddad"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"
			class="mt-0.5 flex-none"
			><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg
		>
		<span>
			Signers and threshold are locked in: together they <b class="font-medium text-fg">are</b>
			the key. To change them later you rotate to a new key.
		</span>
	</p>
</section>
