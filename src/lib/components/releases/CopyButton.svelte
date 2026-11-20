<script lang="ts">
	// Copies `value`. The button is as wide as the wider of its label and
	// "Copied", so copying never moves anything. `tone`: live (mint), seal (a
	// signed release), solid (a multisig release) or plain.
	let {
		value,
		label = 'Copy',
		tone = 'live',
		title
	}: {
		value: string;
		label?: string;
		tone?: 'live' | 'seal' | 'solid' | 'plain';
		// Says what is copied, when the label doesn't.
		title?: string;
	} = $props();

	const tones = {
		live: 'bg-accent-400/14 text-accent-300 hover:bg-accent-400/22',
		seal: 'bg-seal-400/16 text-seal-200 hover:bg-seal-400/24',
		solid: 'bg-seal-400 text-seal-900 hover:bg-seal-300',
		plain: 'bg-white/6 text-fg-2 hover:bg-white/10 hover:text-fg'
	};

	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {}
	}
</script>

<button
	type="button"
	onclick={copy}
	aria-label={title}
	{title}
	class="inline-grid h-11 shrink-0 cursor-pointer place-items-center rounded-[7px] px-2.5 text-xs font-semibold transition-colors sm:h-8 {tones[
		tone
	]}"
>
	<span class="col-start-1 row-start-1 {copied ? 'invisible' : ''}">{label}</span>
	<span class="col-start-1 row-start-1 {copied ? '' : 'invisible'}">Copied</span>
</button>
