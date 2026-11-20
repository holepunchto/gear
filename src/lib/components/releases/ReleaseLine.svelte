<script lang="ts">
	import { multisig, type RepoRelease } from '$lib/releases';

	// The compact release line on library and discover cards. Apricot while
	// something is pending, violet once signed, glowing when multisig.
	let { release }: { release: RepoRelease } = $props();

	const multi = $derived(multisig(release.signers));
</script>

<span
	class="truncate font-mono text-xs font-medium {release.pending
		? 'text-apricot-300'
		: release.version
			? 'text-seal-300'
			: 'text-accent-300'}"
	title={release.name}
>
	<span class={!release.pending && release.version && multi ? 'text-glow-seal' : ''}>◆</span>
	{release.version ?? 'no release yet'} · {release.quorum}/{release.signers}{release.version
		? ' signed'
		: ''}{release.version && multi ? ' · multisig' : ''}{release.pending?.waitingOnMe
		? ' · needs you'
		: ''}
</span>
