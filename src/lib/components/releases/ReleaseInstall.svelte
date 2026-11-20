<script lang="ts">
	import ReleaseSeal from './ReleaseSeal.svelte';
	import CopyInstall from './CopyInstall.svelte';
	import { multisig, type RepoRelease } from '$lib/releases';

	// The latest release's commands for the Clone popover, all from the
	// release key, each with a copy button, and the .npmrc lines npm needs.
	// `pear` adds pear install, for repos that build as Pear apps.
	let {
		name,
		release,
		pear = false
	}: {
		name: string;
		release: RepoRelease & { tag: string; source: { key: string; length: number } };
		pear?: boolean;
	} = $props();

	const multi = $derived(multisig(release.signers));
</script>

<div
	class="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset {multi
		? 'bg-seal-500/12 shadow-glow-seal ring-seal-400/45'
		: 'bg-seal-500/5 ring-seal-400/20'}"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<span class="text-[13px] font-semibold text-fg">
			Latest release <span class="font-mono text-seal-200">{release.tag}</span>
		</span>
		<ReleaseSeal quorum={release.quorum} signers={release.signers} />
	</div>
	<CopyInstall {name} source={release.source} tag={release.tag} {pear} {multi} />
</div>
