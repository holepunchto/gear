<script lang="ts">
	import ReleaseSeal from './ReleaseSeal.svelte';
	import CopyInstall from './CopyInstall.svelte';
	import CopyButton from './CopyButton.svelte';
	import { multisig, repoReleaseHref, type RepoRelease } from '$lib/releases';

	// The latest release's commands for the Clone popover, all from the
	// release key, each with a copy button, the .npmrc lines npm needs, and
	// the key's share link: the only one in the repo view. `pear` adds pear
	// install, for repos that build as Pear apps.
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
			Latest release
			<a
				href={repoReleaseHref(name, release.tag)}
				class="font-mono text-seal-200 no-underline hover:underline">{release.tag}</a
			>
		</span>
		<ReleaseSeal quorum={release.quorum} signers={release.signers} />
	</div>
	<CopyInstall {name} source={release.source} tag={release.tag} {pear} {multi} />
	<div class="flex items-center gap-2 text-xs text-fg-3">
		<span class="min-w-0 flex-1">Whoever follows the share link gets every release</span>
		<CopyButton value={release.share} label="Copy share link" tone="seal" />
	</div>
</div>
