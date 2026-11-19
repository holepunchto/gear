<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import CopyField from './CopyField.svelte';
	import PearSign from './PearSign.svelte';
	import { proposalName, type KeySummary, type Pending } from '$lib/releases';

	// A pending proposal's signatures: the proposal to send, this device's
	// signature, pasting a co-signer's, and Commit. Posts to the key page's
	// actions, so it works from any page.
	let { key, current, response }: { key: KeySummary; current: Pending; response: string | null } =
		$props();

	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);

	const ready = $derived(current.signed.length >= key.quorum);

	function submitting(name: string) {
		return () => {
			busy = name;
			error = null;
			return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
				busy = null;
				if (result.type === 'failure') {
					const data = result.data?.[name] as { error?: string } | undefined;
					error = data?.error ?? 'Something went wrong';
				} else if (result.type === 'error') {
					error = result.error?.message ?? 'Something went wrong';
				} else {
					await update();
				}
			};
		};
	}
</script>

<section
	aria-label="Collect signatures"
	class="flex flex-col gap-4 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
>
	{#if current.mine}
		<div class="flex flex-col gap-2">
			<h2 class="m-0 text-base font-semibold text-fg">Send this to your co-signers</h2>
			<p class="m-0 text-xs text-fg-3">
				They paste it under Release keys, check it on their copy and sign.
			</p>
			<CopyField value={current.proposal} label="Proposal" />
		</div>
	{/if}

	<PearSign request={current.request} />

	{#if current.signedByMe && response && !current.mine}
		<div class="flex flex-col gap-2">
			<h2 class="m-0 text-base font-semibold text-fg">Your signature</h2>
			<p class="m-0 text-xs text-fg-3">Send it back to whoever proposed this release.</p>
			<CopyField value={response} label="Your signature" />
		</div>
	{/if}

	<form
		method="POST"
		action="/releases/{key.key}?/respond"
		class="flex flex-col gap-2"
		use:enhance={submitting('respond')}
	>
		<label for="response-{current.id}" class="text-base font-semibold text-fg"
			>Paste a signature</label
		>
		<input type="hidden" name="id" value={current.id} />
		<div class="flex flex-col gap-2 sm:flex-row">
			<input
				id="response-{current.id}"
				name="response"
				required
				autocomplete="off"
				spellcheck="false"
				placeholder="A co-signer's signature or pear CLI response"
				class="min-w-0 flex-1 rounded-[10px] border-0 bg-bg px-3 py-2.5 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={busy !== null}
				class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-auto"
			>
				{busy === 'respond' ? 'Checking…' : 'Add signature'}
			</button>
		</div>
	</form>

	<div class="flex flex-wrap items-center gap-2.5">
		<form method="POST" action="/releases/{key.key}?/commit" use:enhance={submitting('commit')}>
			<input type="hidden" name="id" value={current.id} />
			<button
				type="submit"
				disabled={!ready || busy !== null}
				class="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-accent-400 px-5 text-sm font-semibold text-accent-900 shadow-[0_8px_28px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300 disabled:cursor-default disabled:bg-surface-4 disabled:text-fg-3 disabled:shadow-none"
			>
				{busy === 'commit' ? 'Committing…' : `Commit ${proposalName(current, '')}`}
			</button>
		</form>
		{#if !ready}
			<span class="text-xs text-fg-3">
				{key.quorum - current.signed.length} more
				{key.quorum - current.signed.length === 1 ? 'signature' : 'signatures'} to commit
			</span>
		{/if}
		{#if current.mine}
			<form
				method="POST"
				action="/releases/{key.key}?/withdraw"
				class="ml-auto"
				use:enhance={submitting('withdraw')}
			>
				<input type="hidden" name="id" value={current.id} />
				<button
					type="submit"
					disabled={busy !== null}
					class="h-11 cursor-pointer rounded-[10px] px-3.5 text-[13px] font-medium text-apricot-300 ring-1 ring-apricot-400/35 ring-inset hover:bg-apricot-400/8"
				>
					Withdraw {proposalName(current, '')}
				</button>
			</form>
		{/if}
	</div>
	{#if error}
		<p class="m-0 text-sm text-red-400" role="alert">{error}</p>
	{/if}
</section>
