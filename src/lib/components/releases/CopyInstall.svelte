<script lang="ts">
	import { installCommands } from '$lib/releases';

	// Copy a release's npm install, git clone or pear install command in one
	// click. All of them read the release key.
	let {
		name,
		source,
		tag,
		pear = false
	}: {
		name: string;
		source: { key: string; length: number };
		tag: string;
		pear?: boolean;
	} = $props();

	const commands = $derived(installCommands(name, source, tag, pear));

	let copied = $state<'npm' | 'git' | 'pear' | null>(null);

	async function copy(what: 'npm' | 'git' | 'pear') {
		try {
			await navigator.clipboard.writeText(commands[what] ?? '');
			copied = what;
			setTimeout(() => (copied = null), 1500);
		} catch {}
	}
</script>

<span class="inline-flex flex-wrap items-center gap-1.5">
	<button
		type="button"
		onclick={() => copy('npm')}
		title="{commands.npm} (needs git=git+pear and allow-git=all in .npmrc)"
		class="inline-flex h-11 cursor-pointer items-center rounded-lg bg-seal-400 px-2.5 text-xs font-semibold text-seal-900 transition-colors hover:bg-seal-300 sm:h-8"
	>
		{copied === 'npm' ? 'Copied' : 'Copy npm install'}
	</button>
	<button
		type="button"
		onclick={() => copy('git')}
		title={commands.git}
		class="inline-flex h-11 cursor-pointer items-center rounded-lg bg-seal-400/16 px-2.5 text-xs font-semibold text-seal-200 transition-colors hover:bg-seal-400/24 sm:h-8"
	>
		{copied === 'git' ? 'Copied' : 'Copy git clone'}
	</button>
	{#if commands.pear}
		<button
			type="button"
			onclick={() => copy('pear')}
			title={commands.pear}
			class="inline-flex h-11 cursor-pointer items-center rounded-lg bg-seal-400/16 px-2.5 text-xs font-semibold text-seal-200 transition-colors hover:bg-seal-400/24 sm:h-8"
		>
			{copied === 'pear' ? 'Copied' : 'Copy pear install'}
		</button>
	{/if}
</span>
