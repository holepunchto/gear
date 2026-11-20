<script lang="ts">
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
	{#each rows as row (row.id)}
		<div
			class="flex items-center gap-2 rounded-[10px] bg-bg px-3 py-2 ring-1 ring-seal-400/30 ring-inset"
		>
			<code class="min-w-0 flex-1 truncate font-mono text-xs text-seal-100" title={row.value}>
				{row.value}
			</code>
			<button
				type="button"
				onclick={() => copy(row.id, row.value)}
				aria-label="Copy {row.id} command"
				class="inline-flex h-9 w-16 shrink-0 cursor-pointer items-center justify-center rounded-[7px] px-2.5 text-xs font-semibold transition-colors sm:h-7 {multi
					? 'bg-seal-400 text-seal-900 hover:bg-seal-300'
					: 'bg-seal-400/16 text-seal-200 hover:bg-seal-400/24'}"
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
			class="w-16 shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-center font-semibold text-seal-300 hover:bg-seal-400/14"
		>
			{copied === 'npmrc' ? 'Copied' : 'Copy'}
		</button>
	</div>
</div>
