<script lang="ts">
	import { avatar, shortKey, type DraftSigner } from '$lib/releases';
	import { initials } from '$lib/initials';

	let { signers = $bindable(), quorum = $bindable() }: { signers: DraftSigner[]; quorum: number } =
		$props();

	let pasted = $state('');
	let pastedLabel = $state('');

	function addSigner() {
		const key = pasted.trim();
		if (!key || signers.some((s) => s.key === key)) return;
		signers.push({ key, label: pastedLabel.trim(), me: false });
		pasted = '';
		pastedLabel = '';
		if (signers.length === 2 && quorum === 1) quorum = 2;
	}

	function remove(i: number) {
		signers.splice(i, 1);
	}
</script>

<section
	aria-label="Signers"
	class="flex flex-col gap-3.5 rounded-[18px] bg-surface p-5 ring-1 ring-accent-300/20 ring-inset"
>
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="m-0 text-xl font-semibold text-fg">Who signs</h2>
		<span class="text-xs text-fg-3">
			Each signer holds their own key. Nobody holds all of them.
		</span>
	</div>

	{#each signers as s, i (s.key)}
		<div
			class="flex items-center gap-3.5 rounded-xl bg-surface-2 px-3.5 py-3 ring-1 ring-white/4 ring-inset"
		>
			<span
				class="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold {avatar(
					i
				)}"
				aria-hidden="true"
				>{s.me ? 'You' : s.label ? initials(s.label) : s.key.slice(0, 2).toUpperCase()}</span
			>
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate font-semibold text-fg">
					{s.me ? 'You' : s.label || 'Signer'}
				</span>
				<span class="truncate font-mono text-xs text-fg-3">
					{shortKey(s.key)}{s.me ? ' · this device' : ''}
				</span>
			</div>
			<input type="hidden" name="signer" value={s.key} />
			<input type="hidden" name="label" value={s.label} />
			{#if !s.me}
				<button
					type="button"
					onclick={() => remove(i)}
					aria-label="Remove {s.label || shortKey(s.key)}"
					class="tap-44 flex cursor-pointer rounded-lg p-1.5 text-fg-3 hover:text-fg"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg
					>
				</button>
			{/if}
		</div>
	{/each}

	<div class="flex flex-wrap gap-2.5">
		<label class="sr-only" for="signer-key">Signing key</label>
		<input
			id="signer-key"
			bind:value={pasted}
			autocomplete="off"
			spellcheck="false"
			placeholder="Paste a co-signer's signing key"
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					addSigner();
				}
			}}
			class="h-11 min-w-0 flex-[1_1_300px] rounded-[10px] border-0 bg-bg px-3 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
		/>
		<label class="sr-only" for="signer-name">Their name</label>
		<input
			id="signer-name"
			bind:value={pastedLabel}
			autocomplete="off"
			placeholder="Name (only on this device)"
			class="h-11 min-w-0 flex-[1_1_180px] rounded-[10px] border-0 bg-bg px-3 text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
		/>
		<button
			type="button"
			onclick={addSigner}
			class="h-11 w-full cursor-pointer rounded-[10px] bg-surface-4 px-3.5 text-[13px] font-medium text-fg hover:bg-surface-3 sm:w-auto"
		>
			Add signer
		</button>
		<span class="basis-full text-xs text-fg-3">
			Each device is its own seat. Co-signers find their key in Settings, under Your signing key.
			Add your other devices the same way.
		</span>
		<span class="basis-full text-xs text-fg-3">
			A <span class="font-mono">pear multisig</span> key works too: paste what
			<span class="font-mono">pear multisig keys get &lt;name&gt;</span> prints. That signer signs with
			the pear CLI.
		</span>
	</div>
</section>
