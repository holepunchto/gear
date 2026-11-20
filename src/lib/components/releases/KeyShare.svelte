<script lang="ts">
	// Copy a release key, or the share link someone else pastes into
	// "Follow a release key".
	let { keyText, share }: { keyText: string; share: string } = $props();

	let copied = $state<'key' | 'share' | null>(null);

	async function copy(what: 'key' | 'share') {
		try {
			await navigator.clipboard.writeText(what === 'key' ? keyText : share);
			copied = what;
			setTimeout(() => (copied = null), 1500);
		} catch {}
	}
</script>

<span class="inline-flex flex-wrap items-center gap-1.5">
	<button
		type="button"
		onclick={() => copy('key')}
		title={keyText}
		class="inline-flex h-11 cursor-pointer items-center rounded-lg bg-white/6 px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-white/10 hover:text-fg sm:h-8"
	>
		{copied === 'key' ? 'Copied' : 'Copy key'}
	</button>
	<button
		type="button"
		onclick={() => copy('share')}
		title={share}
		class="inline-flex h-11 cursor-pointer items-center rounded-lg bg-accent-400/14 px-2.5 text-xs font-semibold text-accent-300 transition-colors hover:bg-accent-400/22 sm:h-8"
	>
		{copied === 'share' ? 'Copied' : 'Copy share link'}
	</button>
</span>
