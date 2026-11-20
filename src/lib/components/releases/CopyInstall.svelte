<script lang="ts">
	import CopyButton from './CopyButton.svelte';
	import { installCommands } from '$lib/releases';

	// A release's npm install, git clone and pear install commands, all from
	// the release key, each with a copy button, and the .npmrc lines npm needs.
	// `multi` is a multisig release: its copy buttons are solid.
	let {
		name,
		source,
		tag,
		pear = false,
		multi = false
	}: {
		name: string;
		source: { key: string; length: number };
		tag: string;
		pear?: boolean;
		multi?: boolean;
	} = $props();

	const commands = $derived(installCommands(name, source, tag, pear));
	const rows = $derived([
		{ id: 'npm', value: commands.npm },
		{ id: 'git', value: commands.git },
		...(commands.pear ? [{ id: 'pear', value: commands.pear }] : [])
	]);
</script>

<div class="flex flex-col gap-2">
	{#each rows as row (row.id)}
		<div
			class="flex items-center gap-2 rounded-[10px] bg-bg px-3 py-2 ring-1 ring-seal-400/30 ring-inset"
		>
			<code class="min-w-0 flex-1 truncate font-mono text-xs text-seal-100" title={row.value}>
				{row.value}
			</code>
			<CopyButton value={row.value} tone={multi ? 'solid' : 'seal'} title="Copy {row.id} command" />
		</div>
	{/each}
	<div class="flex items-center gap-2 text-xs text-fg-3">
		<span class="min-w-0 truncate">
			npm needs <code class="font-mono text-fg-2">git=git+pear</code> and
			<code class="font-mono text-fg-2">allow-git=all</code> in
			<code class="font-mono">.npmrc</code>
		</span>
		<CopyButton value={commands.npmrc} tone="seal" title="Copy .npmrc lines" />
	</div>
</div>
