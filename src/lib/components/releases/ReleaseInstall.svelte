<script lang="ts">
	import { installCommands, type RepoRelease } from '$lib/releases';

	// The latest release's npm and git commands for the Clone popover, each
	// with a copy button, and the .npmrc lines npm needs.
	let {
		name,
		release
	}: {
		name: string;
		release: RepoRelease & { tag: string; source: { key: string; length: number } };
	} = $props();

	const commands = $derived(installCommands(name, release.source, release.tag));
	const rows = $derived([
		{ id: 'npm', value: commands.npm },
		{ id: 'git', value: commands.git }
	]);

	let copied = $state<string | null>(null);

	async function copy(id: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = id;
			setTimeout(() => (copied = null), 1500);
		} catch {}
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-baseline justify-between gap-2">
		<span class="text-[13px] font-semibold text-fg">
			Latest release <span class="font-mono text-accent-200">{release.tag}</span>
		</span>
		<span class="text-xs font-semibold text-accent-300">
			{release.quorum} of {release.signers} signed
		</span>
	</div>
	{#each rows as row (row.id)}
		<div
			class="flex items-center gap-2 rounded-[10px] bg-bg px-3 py-2 ring-1 ring-accent-400/30 ring-inset"
		>
			<code class="min-w-0 flex-1 truncate font-mono text-xs text-accent-100" title={row.value}>
				{row.value}
			</code>
			<button
				type="button"
				onclick={() => copy(row.id, row.value)}
				aria-label="Copy {row.id} command"
				class="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-[7px] bg-accent-400 px-2.5 text-xs font-semibold text-accent-900 transition-colors hover:bg-accent-300 sm:h-7"
			>
				{copied === row.id ? 'Copied' : 'Copy'}
			</button>
		</div>
	{/each}
	<div class="flex items-center gap-2 text-xs text-fg-3">
		<span class="min-w-0 truncate">
			npm needs <code class="font-mono text-fg-2">git=git+pear</code> and
			<code class="font-mono text-fg-2">allow-git=all</code> in
			<code class="font-mono">.npmrc</code>
		</span>
		<button
			type="button"
			onclick={() => copy('npmrc', commands.npmrc)}
			aria-label="Copy .npmrc lines"
			class="shrink-0 cursor-pointer rounded-md px-1.5 py-1 font-semibold text-accent-300 hover:bg-accent-400/14"
		>
			{copied === 'npmrc' ? 'Copied' : 'Copy'}
		</button>
	</div>
</div>
