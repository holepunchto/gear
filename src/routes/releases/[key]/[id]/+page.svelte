<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import type { PageProps } from './$types';
	import ChangeList from '$lib/components/releases/ChangeList.svelte';
	import CopyField from '$lib/components/releases/CopyField.svelte';
	import CopyInstall from '$lib/components/releases/CopyInstall.svelte';
	import FlowStep from '$lib/components/releases/FlowStep.svelte';
	import PearSign from '$lib/components/releases/PearSign.svelte';
	import ReleaseSeal from '$lib/components/releases/ReleaseSeal.svelte';
	import { flowSteps } from '$lib/release-flow.js';
	import {
		ago,
		avatar,
		changesSummary,
		liveReleases,
		multisig,
		signerInitials,
		signerName,
		tagHref,
		type Changes,
		type Inspection
	} from '$lib/releases';

	let { data, form }: PageProps = $props();

	let inspection = $state<Inspection | null>(null);
	let changes = $state<Changes | null | undefined>(undefined);
	let busy = $state<string | null>(null);
	let errors = $state<Record<string, string>>({});
	let password = $state('');

	onMount(liveReleases);

	$effect(() => {
		const pending = data.inspection;
		inspection = null;
		pending.then((result) => {
			if (data.inspection === pending) inspection = result;
		});
	});

	$effect(() => {
		const pending = data.changes;
		changes = undefined;
		pending.then((result) => {
			if (data.changes === pending) changes = result;
		});
	});

	const key = $derived(data.key);
	const proposal = $derived(data.proposal);
	const release = $derived(inspection?.ok ? inspection.release : proposal.release);
	// Every tag signing adds to the key: this release and any tagged since the
	// last one.
	const others = $derived(
		inspection?.ok ? inspection.tags.filter((t) => t.tag !== release?.tag).map((t) => t.tag) : []
	);
	const name = $derived(release?.name ?? 'release');
	const response = $derived(typeof form?.response === 'string' ? form.response : data.response);
	const allPass = $derived(inspection?.checks.every((c) => c.ok) ?? false);

	const flow = $derived(
		flowSteps({
			quorum: key.quorum,
			signers: key.signers,
			signed: proposal.signed,
			length: proposal.length,
			keyLength: key.length
		})
	);
	const status = $derived(Object.fromEntries(flow.steps.map((s) => [s.id, s.state])));
	const number = $derived(Object.fromEntries(flow.steps.map((s, i) => [s.id, i + 1])));
	const published = $derived(status.done === 'done');
	const me = $derived(key.signers.find((s) => s.me) ?? null);
	const waiting = $derived(key.signers.filter((s) => !s.me && !proposal.signed.includes(s.key)));
	const repoName = $derived(key.repo?.name ?? key.name.split('/')[0]);
	const back = $derived(key.repo ? `/${key.repo.name}/releases` : `/releases/${key.key}`);

	const signLine = $derived(
		status.sign === 'done'
			? `You signed with ${key.signAs ? `your pear key ${key.signAs}` : 'your Gear key'}`
			: status.sign === 'skipped'
				? 'Not needed: enough signers signed without you'
				: 'Check it on your copy, then sign'
	);
	const signaturesLine = $derived(
		status.signatures === 'done'
			? `${Math.min(proposal.signed.length, key.quorum)} of ${key.quorum} signed`
			: `${proposal.signed.length} of ${key.quorum} signed · waiting on ${waiting.map(signerName).join(', ')}`
	);
	const publishLine = $derived.by(() => {
		if (published) {
			if (proposal.publishing) return 'Published · seeding to blind peers…';
			if (proposal.published?.mirrored) return 'Published · seeded to 2 blind peers';
			if (proposal.published) return 'Published · blind peers are still catching up';
			return 'Published by a co-signer';
		}
		if (status.publish === 'open') {
			if (proposal.publishing) return 'Publishing…';
			if (proposal.error) return 'Publishing failed';
			return 'Signed and ready to publish';
		}
		if (!proposal.mine) return 'Whoever holds the last signature publishes it';
		return proposal.autoPublish
			? 'Publishes on its own when the last signature lands'
			: 'Waits for you once signed';
	});

	function submitting(name: string, done?: () => void) {
		return () => {
			busy = name;
			delete errors[name];
			return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
				busy = null;
				password = '';
				if (result.type === 'failure') {
					const action = name.split(':')[0];
					errors[name] =
						(result.data?.[action] as { error?: string } | undefined)?.error ??
						'Something went wrong';
				} else if (result.type === 'error') {
					errors[name] = result.error?.message ?? 'Something went wrong';
				} else {
					done?.();
					await update();
				}
			};
		};
	}

	const field =
		'min-w-0 flex-1 rounded-[10px] border-0 bg-bg px-3 py-2.5 text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none';
	const primary =
		'inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-accent-400 px-5 text-sm font-semibold text-accent-900 shadow-[0_8px_28px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300 disabled:cursor-default disabled:bg-surface-4 disabled:text-fg-3 disabled:shadow-none';
</script>

<svelte:head>
	<title>Release {name} · {key.name} · Gear</title>
</svelte:head>

<main class="relative mx-auto flex max-w-[600px] flex-col gap-6 px-[18px] pt-3 pb-24 sm:pt-8">
	<header class="flex items-center gap-2.5">
		<a
			href={back}
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
		<span class="flex-1 text-center text-[13px] text-fg-2">
			{published ? 'Released' : `Step ${flow.current + 1} of ${flow.steps.length}`}
		</span>
		<details class="relative">
			<summary
				aria-label="More"
				class="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-fg-2 hover:text-fg"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
					><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle
						cx="19"
						cy="12"
						r="1.8"
					/></svg
				>
			</summary>
			<div
				class="absolute right-0 z-20 mt-1 flex w-56 flex-col rounded-xl bg-surface-2 p-1.5 shadow-xl ring-1 ring-line-strong ring-inset"
			>
				<a
					href="/releases/{key.key}"
					class="flex min-h-10 items-center rounded-lg px-3 text-[13px] text-fg no-underline hover:bg-surface-3"
				>
					Release key {key.name}
				</a>
				{#if !published}
					<form method="POST" action="?/withdraw" use:enhance={submitting('withdraw')}>
						<button
							type="submit"
							disabled={busy !== null}
							class="flex min-h-10 w-full cursor-pointer items-center rounded-lg px-3 text-left text-[13px] text-apricot-300 hover:bg-apricot-400/8"
						>
							{proposal.mine ? `Withdraw ${name}` : 'Remove from this device'}
						</button>
					</form>
				{/if}
			</div>
		</details>
	</header>

	<div class="flex flex-col items-center gap-2 text-center">
		<span class="font-mono text-xs text-fg-3">{key.name}</span>
		<h1
			class="m-0 font-display text-[54px] leading-none font-semibold tracking-[-0.04em] break-all {published
				? 'text-seal-200'
				: 'text-fg'}"
		>
			{release?.name ?? '…'}
		</h1>
		<span class="text-[13px] text-fg-2">
			{proposal.mine ? 'You proposed this' : 'A co-signer asked you'} · {ago(proposal.added)}
			· {key.quorum} of {key.signers.length} must sign
		</span>
	</div>

	<ol class="m-0 flex list-none flex-col p-0" aria-label="Release steps">
		<FlowStep
			n={number.version}
			title="Version {release?.name ?? ''}"
			status="done"
			line={release
				? `${release.tag} at ${release.commit.slice(0, 7)}${changes ? ` · ${changesSummary(changes)}` : ''}`
				: 'Not checked on this device yet'}
		>
			<details class="group rounded-2xl bg-surface ring-1 ring-line ring-inset">
				<summary
					class="flex min-h-11 cursor-pointer list-none items-center px-4 text-[13px] font-medium text-fg-2 hover:text-fg"
				>
					What it releases
				</summary>
				<div class="flex flex-col gap-3 px-4 pb-4">
					{#if release}
						<dl class="m-0 grid grid-cols-[96px_minmax(0,1fr)] text-[13px]">
							<dt class="py-1.5 text-fg-2">Tag</dt>
							<dd class="m-0 truncate py-1.5 font-mono text-fg">{release.tag}</dd>
							<dt class="py-1.5 text-fg-2">Commit</dt>
							<dd class="m-0 truncate py-1.5 font-mono text-fg" title={release.commit}>
								{release.commit}
							</dd>
							<dt class="py-1.5 text-fg-2">Tree</dt>
							<dd class="m-0 truncate py-1.5 font-mono text-fg" title={release.tree}>
								{release.tree}
							</dd>
							<dt class="py-1.5 text-fg-2">Repo up to</dt>
							<dd class="m-0 truncate py-1.5 font-mono text-fg">length {proposal.length}</dd>
							{#if others.length}
								<dt class="py-1.5 text-fg-2">Also signs</dt>
								<dd class="m-0 truncate py-1.5 font-mono text-fg" title={others.join(', ')}>
									{others.join(', ')}
								</dd>
							{/if}
						</dl>
					{/if}
					{#if changes?.commits.length}
						<ChangeList {changes} compact />
					{/if}
				</div>
			</details>
		</FlowStep>

		{#if status.sign}
			<FlowStep n={number.sign} title="Sign" status={status.sign} line={signLine}>
				{#if status.sign === 'open'}
					<section
						aria-label="Checked on your copy"
						aria-busy={inspection === null}
						class="flex flex-col gap-2.5 rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line ring-inset"
					>
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

					<form
						method="POST"
						action="?/sign"
						class="flex flex-col gap-2.5"
						use:enhance={submitting('sign')}
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
							disabled={!inspection?.ok || busy !== null || (key.signAs !== null && !password)}
							class="{primary} h-12"
						>
							{#if busy === 'sign'}
								Signing…
							{:else if inspection?.ok && !allPass}
								Sign anyway
							{:else}
								Sign {release?.name ?? ''}
							{/if}
						</button>
						{#if inspection?.ok && !allPass}
							<span class="text-xs text-apricot-300">
								Some checks could not run on this device. Sign only if you trust what you see above.
							</span>
						{/if}
						{#if errors.sign}
							<span class="text-sm text-red-400" role="alert">{errors.sign}</span>
						{/if}
					</form>
					{#if key.signAs}
						<PearSign request={proposal.request} open={false} />
					{/if}
				{/if}
			</FlowStep>
		{/if}

		{#if status.signatures}
			<FlowStep
				n={number.signatures}
				title="Signatures"
				status={status.signatures}
				line={signaturesLine}
			>
				{#if status.signatures === 'open'}
					{#if !proposal.mine && response}
						<div class="flex flex-col gap-2">
							<span class="text-sm font-semibold text-fg">Send your signature back</span>
							<span class="text-xs text-fg-3">
								To whoever proposed this release. When theirs and yours make {key.quorum}, they
								publish it.
							</span>
							<CopyField value={response} label="Your signature" />
						</div>
					{/if}
					<ul class="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Signers">
						{#each key.signers as s, i (s.key)}
							{@const signed = proposal.signed.includes(s.key)}
							<li
								class="flex flex-col gap-3 rounded-2xl p-3.5 ring-1 ring-inset {signed
									? 'bg-accent-400/6 ring-accent-300/25'
									: 'bg-surface ring-line'}"
							>
								<div class="flex items-center gap-3">
									<span
										class="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[11px] font-bold {avatar(
											i
										)}"
										aria-hidden="true">{signerInitials(s)}</span
									>
									<span class="min-w-0 flex-1 truncate font-semibold text-fg">
										{signerName(s)}{s.me && s.label ? ' · you' : ''}
									</span>
									{#if signed}
										<span
											class="rounded-full bg-accent-400/14 px-2.5 py-1 text-xs font-semibold text-accent-300"
										>
											✓ Signed
										</span>
									{:else}
										<span
											class="rounded-full bg-apricot-400/12 px-2.5 py-1 text-xs font-semibold text-apricot-300"
										>
											{proposal.mine ? 'Waiting' : 'Not seen here'}
										</span>
									{/if}
								</div>
								{#if !signed && !s.me && proposal.mine}
									<div class="flex flex-col gap-2">
										<span class="text-xs text-fg-2">
											{s.gear
												? `Send ${signerName(s)} the Gear proposal. They paste it under Release keys, check it and sign.`
												: `Send ${signerName(s)} the Gear proposal if they use Gear, or the pear CLI command if they sign with a pear key.`}
										</span>
										<CopyField value={proposal.proposal} label="Gear proposal" />
										{#if !s.gear}
											<PearSign request={proposal.request} signers={[s]} open={false} />
										{/if}
									</div>
									<form
										method="POST"
										action="?/respond"
										class="flex flex-col gap-2"
										use:enhance={submitting(`respond:${s.key}`)}
									>
										<label for="response-{s.key}" class="text-xs text-fg-2">
											Paste what {signerName(s)} sends back
										</label>
										<input type="hidden" name="signer" value={s.key} />
										<div class="flex flex-col gap-2 sm:flex-row">
											<input
												id="response-{s.key}"
												name="response"
												required
												autocomplete="off"
												spellcheck="false"
												placeholder="Their signature or pear CLI response"
												class="{field} font-mono"
											/>
											<button
												type="submit"
												disabled={busy !== null}
												class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-auto"
											>
												{busy === `respond:${s.key}` ? 'Checking…' : 'Add signature'}
											</button>
										</div>
										{#if errors[`respond:${s.key}`]}
											<span class="text-sm text-red-400" role="alert">
												{errors[`respond:${s.key}`]}
											</span>
										{/if}
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</FlowStep>
		{/if}

		<FlowStep n={number.publish} title="Publish" status={status.publish} line={publishLine}>
			{#if status.publish === 'open'}
				{#if proposal.publishing}
					<div class="flex items-center gap-2.5 text-[13px] text-fg-2" role="status">
						<span
							class="h-4 w-4 animate-spin rounded-full border-2 border-apricot-400/30 border-t-apricot-400"
							aria-hidden="true"
						></span>
						Publishing {name} and waiting for 2 blind peers to hold it…
					</div>
				{:else}
					<form
						method="POST"
						action="?/publish"
						class="flex flex-col gap-2"
						use:enhance={submitting('publish')}
					>
						{#if proposal.error}
							<span class="text-sm text-red-400" role="alert">{proposal.error}</span>
						{/if}
						<button type="submit" disabled={busy !== null} class="{primary} self-start">
							{busy === 'publish'
								? 'Publishing…'
								: proposal.error
									? 'Try again'
									: `Publish ${name}`}
						</button>
						{#if errors.publish}
							<span class="text-sm text-red-400" role="alert">{errors.publish}</span>
						{/if}
					</form>
				{/if}
			{/if}
			{#if !published && !proposal.publishing}
				<form
					method="POST"
					action="?/autoPublish"
					use:enhance={submitting('autoPublish')}
					class="flex items-center"
				>
					<input type="hidden" name="on" value={String(!proposal.autoPublish)} />
					<label class="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] text-fg-2">
						<input
							type="checkbox"
							checked={proposal.autoPublish}
							disabled={busy !== null}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
							class="h-4 w-4 accent-accent-400"
						/>
						Publish when signed
					</label>
				</form>
			{/if}
		</FlowStep>

		<FlowStep
			n={number.done}
			title="Done"
			status={status.done}
			line={published ? `${name} is released` : 'Links to get it appear here once it is published'}
			last
		>
			{#if published && release}
				<div
					class="flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-inset {multisig(key.signers.length)
						? 'bg-seal-500/12 shadow-glow-seal ring-seal-400/45'
						: 'bg-seal-500/5 ring-seal-400/20'}"
				>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<a
							href={tagHref(key.key, release.tag)}
							class="font-mono text-sm font-semibold text-seal-200 no-underline hover:underline"
						>
							{release.tag} →
						</a>
						<ReleaseSeal quorum={key.quorum} signers={key.signers.length} />
					</div>
					<CopyInstall
						name={repoName}
						source={{ key: key.key, length: proposal.length }}
						tag={release.tag}
						pear={data.app?.pear ?? false}
						multi={multisig(key.signers.length)}
					/>
					<div class="flex flex-col gap-1.5">
						<span class="text-xs text-fg-2">
							Share link: whoever follows it gets every release signed on this key
						</span>
						<CopyField value={key.share} label="Share link" seal />
					</div>
				</div>
			{/if}
		</FlowStep>
	</ol>
</main>
