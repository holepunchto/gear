<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import CopyField from '$lib/components/releases/CopyField.svelte';
	import PearSign from '$lib/components/releases/PearSign.svelte';
	import {
		ago,
		avatar,
		liveReleases,
		shortKey,
		signerInitials,
		signerName,
		type Inspection
	} from '$lib/releases';

	let { data, form }: PageProps = $props();

	let inspection = $state<Inspection | null>(null);
	let signing = $state(false);
	let password = $state('');

	onMount(liveReleases);

	$effect(() => {
		const pending = data.inspection;
		inspection = null;
		pending.then((result) => {
			if (data.inspection === pending) inspection = result;
		});
	});

	const key = $derived(data.key);
	const proposal = $derived(data.proposal);
	const release = $derived(inspection?.ok ? inspection.release : proposal.release);
	// Set for a rotation: the key this one hands its release log over to.
	const rotate = $derived(inspection?.ok ? inspection.rotate : null);
	const rotating = $derived(rotate !== null || Boolean(proposal.rotate));
	const title = $derived(rotating ? 'rotation' : (release?.name ?? 'release'));
	const response = $derived(typeof form?.response === 'string' ? form.response : data.response);
	const committed = $derived(key.length > proposal.previous);
	const allPass = $derived(inspection?.checks.every((c) => c.ok) ?? false);
</script>

<svelte:head>
	<title>Sign {title} · {key.name} · Gear</title>
</svelte:head>

<main class="relative mx-auto flex max-w-[560px] flex-col px-[18px] pt-3 pb-40 sm:pt-8 sm:pb-16">
	<header class="flex items-center gap-2.5 pb-2">
		<a
			href="/releases/{key.key}"
			aria-label="Close"
			class="-ml-2.5 flex h-11 w-11 items-center justify-center text-fg no-underline"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg
			>
		</a>
		<span class="mr-[34px] flex-1 text-center text-[13px] text-fg-2">Signature requested</span>
	</header>

	<div class="flex flex-col gap-4">
		<div class="flex flex-col items-center gap-2 text-center">
			<span class="font-mono text-xs text-fg-3">{key.name}</span>
			<h1
				class="m-0 font-display text-[54px] leading-none font-semibold tracking-[-0.04em] break-all text-fg"
			>
				{rotating ? 'Rotation' : (release?.name ?? '…')}
			</h1>
			<span class="text-[13px] text-fg-2">
				{proposal.mine ? 'You proposed this' : 'A co-signer asked you'} · {ago(proposal.added)}
			</span>
		</div>

		<div class="flex flex-wrap items-center justify-center gap-y-2" aria-hidden="true">
			{#each key.signers as s, i (s.key)}
				{@const signed = proposal.signed.includes(s.key)}
				{#if i > 0}
					<span
						class="h-0.5 w-7 {signed || s.me
							? 'bg-linear-90 from-accent-400 to-apricot-400'
							: 'bg-neutral-800'}"
					></span>
				{/if}
				<span
					title={signerName(s)}
					class="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold {signed
						? 'bg-accent-400 text-accent-900 shadow-[0_0_14px_rgb(35_204_148/0.6)]'
						: s.me
							? 'bg-[#16120c] text-apricot-300 shadow-[inset_0_0_0_2px_#fb923c]'
							: `${avatar(i)} opacity-60`}">{signerInitials(s)}</span
				>
			{/each}
		</div>

		<span class="text-center text-[13px] font-medium text-apricot-300">
			{#if committed}
				{rotating ? 'This rotation is' : 'This release is'} already in the log.
			{:else if proposal.mine}
				{proposal.signed.length} of {key.quorum} signatures in.
			{:else if proposal.signedByMe}
				You signed. Send your signature back so it can be committed.
			{:else}
				{key.quorum} of {key.signers.length} must sign. Yours is one of them.
			{/if}
		</span>

		<section
			aria-label="Checked on your copy"
			aria-busy={inspection === null}
			class="flex flex-col gap-2.5 rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line ring-inset"
		>
			<h2 class="m-0 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">
				Checked on your copy
			</h2>
			{#if inspection === null}
				<div class="flex items-center gap-2.5 text-[13px] text-fg-2">
					<span
						class="h-4 w-4 animate-spin rounded-full border-2 border-accent-400/30 border-t-accent-400"
						aria-hidden="true"
					></span>
					Replicating the proposal and checking it…
				</div>
			{:else if !inspection.ok}
				<div class="flex items-start gap-2.5 text-[13px] text-red-300">
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.6"
						stroke-linecap="round"
						aria-hidden="true"
						class="mt-0.5 flex-none"><path d="M6 6l12 12M18 6 6 18" /></svg
					>
					<span>{inspection.error}</span>
				</div>
			{:else}
				{#each inspection.checks as c (c.label)}
					<div class="flex items-center gap-2.5 text-[13px]">
						{#if c.ok}
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#23cc94"
								stroke-width="2.6"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-label="Passed"
								role="img"><path d="m5 12 5 5 9-10" /></svg
							>
						{:else}
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#fb923c"
								stroke-width="2.6"
								stroke-linecap="round"
								aria-label="Not checked"
								role="img"><path d="M12 7v6M12 17v.01" /></svg
							>
						{/if}
						<span class="flex-1 {c.ok ? 'text-fg' : 'text-apricot-300'}">{c.label}</span>
						<span class="font-mono text-[11px] text-fg-3">{c.detail}</span>
					</div>
				{/each}
			{/if}
		</section>

		{#if rotate}
			<section
				aria-label="What this rotation does"
				class="flex flex-col gap-3 rounded-2xl bg-surface px-4 py-3.5 text-[13px] ring-1 ring-accent-300/25 ring-inset"
			>
				<p class="m-0 leading-normal text-fg">
					Signing hands the <span class="font-mono">{key.name}</span> release log over to a new key.
					Once it commits, <span class="font-mono">{key.name}</span> takes no more releases, and anyone
					holding it is pointed at the new key.
				</p>
				<dl class="m-0 grid grid-cols-[96px_minmax(0,1fr)]">
					<dt class="py-1.5 text-fg-2">New key</dt>
					<dd class="m-0 truncate py-1.5 font-mono text-fg" title={rotate.to}>
						{rotate.name ?? shortKey(rotate.to)}
					</dd>
					<dt class="py-1.5 text-fg-2">Key</dt>
					<dd class="m-0 truncate py-1.5 font-mono text-fg" title={rotate.to}>{rotate.to}</dd>
					<dt class="py-1.5 text-fg-2">Must sign</dt>
					<dd class="m-0 py-1.5 text-fg">
						{rotate.signers ? `${rotate.quorum} of ${rotate.signers.length}` : 'not known here'}
					</dd>
				</dl>
				{#if rotate.signers}
					<ul class="m-0 flex list-none flex-col gap-1.5 p-0">
						{#each rotate.signers as s, i (s.key)}
							<li class="flex items-center gap-2.5">
								<span
									class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10px] font-semibold {avatar(
										i
									)}">{signerInitials(s)}</span
								>
								<span class="truncate text-fg">{signerName(s)}</span>
								<span class="ml-auto font-mono text-[11px] text-fg-3">{shortKey(s.key)}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="m-0 leading-normal text-apricot-300">
						Gear can't open the new key from here: it has no entries yet. Check with whoever
						proposed this that <span class="font-mono">{shortKey(rotate.to)}</span> is the key you agreed
						on.
					</p>
				{/if}
			</section>
		{:else if release}
			<dl
				class="m-0 grid grid-cols-[96px_minmax(0,1fr)] rounded-2xl bg-surface px-4 py-2 text-[13px] ring-1 ring-line ring-inset"
			>
				<dt class="py-2 text-fg-2">Tag</dt>
				<dd class="m-0 truncate py-2 font-mono text-fg">{release.tag}</dd>
				<dt class="py-2 text-fg-2">Commit</dt>
				<dd class="m-0 truncate py-2 font-mono text-fg" title={release.commit}>{release.commit}</dd>
				<dt class="py-2 text-fg-2">Tree</dt>
				<dd class="m-0 truncate py-2 font-mono text-fg" title={release.tree}>{release.tree}</dd>
				<dt class="py-2 text-fg-2">Repo length</dt>
				<dd class="m-0 truncate py-2 font-mono text-fg">{release.repo.length}</dd>
			</dl>
		{/if}

		{#if response}
			<section aria-label="Your signature" class="flex flex-col gap-2">
				<h2 class="m-0 text-base font-semibold text-fg">Send this back</h2>
				<p class="m-0 text-xs text-fg-3">
					{proposal.mine
						? 'Your signature is already on your proposal.'
						: `Paste it to whoever proposed the ${rotating ? 'rotation' : 'release'}, so they can commit it.`}
				</p>
				<CopyField value={response} label="Your signature" />
			</section>
		{/if}
	</div>

	{#if !response && !committed}
		<form
			method="POST"
			action="?/sign"
			class="fixed inset-x-[18px] bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2.5 sm:static sm:mt-6"
			use:enhance={() => {
				signing = true;
				return async ({ update }) => {
					password = '';
					await update();
					signing = false;
				};
			}}
		>
			{#if key.signAs}
				<label class="flex flex-col gap-1.5 text-xs text-fg-2">
					Password for your pear key <span class="font-mono text-fg">{key.signAs}</span>
					<input
						type="password"
						name="password"
						bind:value={password}
						required
						autocomplete="off"
						class="h-11 rounded-[10px] border-0 bg-bg px-3 text-sm text-fg ring-1 ring-line-strong ring-inset focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
					/>
				</label>
			{/if}
			<button
				type="submit"
				disabled={!inspection?.ok || signing || (key.signAs !== null && !password)}
				class="h-[60px] cursor-pointer rounded-[18px] bg-accent-400 text-base font-semibold text-accent-900 shadow-[0_12px_34px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300 disabled:cursor-default disabled:bg-surface-4 disabled:text-fg-3 disabled:shadow-none"
			>
				{#if signing}
					Signing…
				{:else if inspection?.ok && !allPass}
					Sign anyway
				{:else}
					Sign {rotating ? 'rotation' : (release?.name ?? '')}
				{/if}
			</button>
			{#if inspection?.ok && !allPass}
				<span class="text-center text-xs text-apricot-300">
					Some checks could not run on this device. Sign only if you trust what you see above.
				</span>
			{/if}
			{#if form?.sign?.error}
				<span class="text-center text-sm text-red-400" role="alert">{form.sign.error}</span>
			{/if}
		</form>
		{#if key.signAs}
			<div class="mt-4">
				<PearSign request={proposal.request} />
			</div>
		{/if}
	{/if}
</main>
