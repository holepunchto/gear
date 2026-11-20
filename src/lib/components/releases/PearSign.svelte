<script lang="ts">
	import CopyField from './CopyField.svelte';
	import { signerName, type Signer } from '$lib/releases';

	// For a signer whose seat is a `pear multisig` key: the command that signs
	// the raw request inside a Gear proposal. Open by default when `signers`,
	// the seats that may need it, are named.
	let {
		request,
		signers = [],
		open
	}: { request: string; signers?: Signer[]; open?: boolean } = $props();

	let name = $state('default');

	const command = $derived(`pear multisig sign ${request} ${name.trim() || 'default'}`);
</script>

<details
	open={open ?? signers.length > 0}
	class="group rounded-xl bg-bg ring-1 ring-line-strong ring-inset"
>
	<summary
		class="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 px-3.5 py-2 text-sm font-semibold text-fg"
	>
		For the pear CLI
		<span class="text-xs font-normal text-fg-3">
			{signers.length > 0
				? `for ${signers.map(signerName).join(', ')}`
				: 'for a signer with a pear multisig key'}
		</span>
	</summary>
	<div class="flex flex-col gap-3 px-3.5 pb-3.5">
		<p class="m-0 text-xs leading-normal text-fg-3">
			Not the proposal: <span class="font-mono">pear multisig sign</span> needs the raw request inside
			it and fails with "Invalid signing request" on a Gear proposal. The signer runs this with their
			key's name and sends back the response. The CLI signs whatever it is shown and doesn't check the
			release the way Gear does, so they should trust whoever proposed it.
		</p>
		<label class="flex flex-col gap-1.5 text-xs text-fg-2">
			Key name
			<input
				bind:value={name}
				autocomplete="off"
				spellcheck="false"
				class="h-11 rounded-[10px] border-0 bg-surface px-3 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset focus:ring-2 focus:ring-accent-400/50 focus:outline-none sm:h-9 sm:max-w-[240px]"
			/>
		</label>
		<CopyField value={command} label="pear multisig sign command" />
	</div>
</details>
