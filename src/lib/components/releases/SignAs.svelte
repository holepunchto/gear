<script lang="ts">
	import type { DraftSigner, PearKey } from '$lib/releases';
	import { shortKey } from '$lib/releases';

	// Which of your keys holds your seat on a new key: this device's Gear key
	// or a pear multisig key from ~/.pear. Swaps your signer in `signers` and
	// posts the pear key's name as `signAs`. Shows only when pear keys exist.
	let {
		gearKey,
		pearKeys,
		signers = $bindable()
	}: { gearKey: string; pearKeys: PearKey[]; signers: DraftSigner[] } = $props();

	let choice = $state('');

	function pick(name: string) {
		choice = name;
		const key = pearKeys.find((k) => k.name === name)?.key ?? gearKey;
		signers = signers.map((s) => (s.me ? { ...s, key } : s));
	}
</script>

{#if pearKeys.length > 0}
	<label
		class="flex flex-col gap-1.5 rounded-[18px] bg-surface p-5 text-xs text-fg-2 ring-1 ring-line ring-inset"
	>
		<span class="text-base font-semibold text-fg">You sign as</span>
		<select
			value={choice}
			onchange={(e) => pick(e.currentTarget.value)}
			class="h-11 rounded-[10px] border-0 bg-bg px-2.5 text-sm text-fg ring-1 ring-line-strong ring-inset focus:ring-2 focus:ring-accent-400/50 focus:outline-none sm:h-10"
		>
			<option value="">This device's Gear key · {shortKey(gearKey)}</option>
			{#each pearKeys as k (k.name)}
				<option value={k.name}>pear key {k.name} · {shortKey(k.key)}</option>
			{/each}
		</select>
		<span class="text-fg-3">
			{choice
				? `Gear asks for ${choice}'s password when you propose or sign, the same one pear multisig sign asks for.`
				: 'Gear signs for you with no password. Pick a pear key to sign with that instead.'}
		</span>
		<input type="hidden" name="signAs" value={choice} />
	</label>
{/if}
