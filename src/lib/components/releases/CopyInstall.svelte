<script lang="ts">
	import { installCommands } from '$lib/releases';

	// Copy a release's npm install or git clone command in one click.
	let {
		name,
		source,
		tag
	}: { name: string; source: { key: string; length: number }; tag: string } = $props();

	const commands = $derived(installCommands(name, source, tag));

	let copied = $state<'npm' | 'git' | null>(null);

	async function copy(what: 'npm' | 'git') {
		try {
			await navigator.clipboard.writeText(commands[what]);
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
		class="inline-flex h-11 cursor-pointer items-center rounded-lg bg-accent-400 px-2.5 text-xs font-semibold text-accent-900 transition-colors hover:bg-accent-300 sm:h-8"
	>
		{copied === 'npm' ? 'Copied' : 'Copy npm install'}
	</button>
	<button
		type="button"
		onclick={() => copy('git')}
		title={commands.git}
		class="inline-flex h-11 cursor-pointer items-center rounded-lg bg-accent-400/14 px-2.5 text-xs font-semibold text-accent-300 transition-colors hover:bg-accent-400/22 sm:h-8"
	>
		{copied === 'git' ? 'Copied' : 'Copy git clone'}
	</button>
</span>
