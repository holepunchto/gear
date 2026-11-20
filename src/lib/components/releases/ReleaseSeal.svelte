<script lang="ts">
	import { multisig } from '$lib/releases';

	// The badge on a signed release: a filled, glowing seal for a multisig
	// key, an outline for a single signer.
	let { quorum, signers }: { quorum: number; signers: number } = $props();

	const multi = $derived(multisig(signers));
</script>

<span
	class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset {multi
		? 'bg-seal-500/18 text-seal-200 shadow-glow-seal ring-seal-400/45'
		: 'text-seal-300 ring-seal-400/40'}"
>
	<svg
		width="13"
		height="13"
		viewBox="0 0 24 24"
		fill={multi ? 'currentColor' : 'none'}
		fill-opacity="0.25"
		stroke="currentColor"
		stroke-width="2.4"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" /><path d="m9 12 2 2 4-4" /></svg
	>
	{quorum} of {signers} signed{multi ? ' · multisig' : ''}
</span>
