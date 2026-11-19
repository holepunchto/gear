<script lang="ts">
	import CopyField from './CopyField.svelte';

	// For a signer whose seat is a `pear multisig` key: the raw signing request
	// and the command that signs it.
	let { request }: { request: string } = $props();

	let name = $state('default');

	const command = $derived(`pear multisig sign ${request} ${name.trim() || 'default'}`);
</script>

<details class="group rounded-xl bg-bg ring-1 ring-line-strong ring-inset">
	<summary
		class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-sm font-semibold text-fg"
	>
		Sign with the pear CLI
		<span class="text-xs font-normal text-fg-3 group-open:hidden">for a pear multisig key</span>
	</summary>
	<div class="flex flex-col gap-3 px-3.5 pb-3.5">
		<p class="m-0 text-xs leading-normal text-fg-3">
			A signer whose key lives in <span class="font-mono">~/.pear</span> runs this and pastes the response
			below. The CLI signs whatever request it is shown and doesn't check the release the way Gear does,
			so inspect the proposal in Gear first, or trust whoever proposed it.
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
		<CopyField value={request} label="Signing request" />
	</div>
</details>
