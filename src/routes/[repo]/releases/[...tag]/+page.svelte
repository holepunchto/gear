<script lang="ts">
	import type { PageProps } from './$types';
	import ReleaseFlow from '$lib/components/releases/ReleaseFlow.svelte';
	import ReleaseSeal from '$lib/components/releases/ReleaseSeal.svelte';
	import Revoked from '$lib/components/releases/Revoked.svelte';
	import ChangeList from '$lib/components/releases/ChangeList.svelte';
	import CopyInstall from '$lib/components/releases/CopyInstall.svelte';
	import {
		avatar,
		changesSummary,
		multisig,
		repoReleaseHref,
		shortKey,
		signerInitials,
		signerName
	} from '$lib/releases';
	import { relativeTime, isoDate } from '$lib/time';

	// A release in its repo: signed, or the steps of one in progress. The
	// repo layout keeps it live.
	let { data }: PageProps = $props();

	const repo = $derived(data.repo.name);
	const href = (tag: string) => repoReleaseHref(repo, tag, data.pick ?? undefined);

	const rows = $derived.by(() => {
		if (data.view !== 'signed') return [];
		const r = data.release;
		return [
			{ k: 'Tag', v: r.tag, href: `/${repo}/${r.commit}/` },
			{ k: 'Commit', v: r.commit, href: `/${repo}/commit/${r.commit}` },
			{ k: 'Tree', v: r.tree, href: `/${repo}/${r.commit}/` },
			{ k: 'Signed repo', v: `${repo} up to length ${data.key.length}`, href: null },
			{
				k: 'Signed before it',
				v: data.previous?.name ?? 'nothing older on this key',
				href: data.previous && href(data.previous.tag)
			}
		];
	});
</script>

<svelte:head>
	{#if data.view === 'signed'}
		<title>{data.release.name} · {repo} · Gear</title>
	{/if}
</svelte:head>

<div class="flex flex-col gap-6">
	<a
		href="/{repo}/releases"
		class="tap-44 self-start text-[13px] font-medium text-fg-2 no-underline hover:text-accent-300"
	>
		← Releases
	</a>

	{#if data.view === 'flow'}
		<div class="mx-auto flex w-full max-w-[600px] flex-col gap-6">
			<ReleaseFlow {data} actions="/releases/{data.key.key}/{data.proposal.id}" close={false} />
		</div>
	{:else}
		{@const key = data.key}
		{@const r = data.release}
		{@const changes = data.changes}
		{@const previous = data.previous}
		{@const next = data.next}
		{@const committed = changes?.commits[0]?.oid === r.commit ? changes.commits[0].timestamp : null}
		{#if key.revoked}
			<Revoked {key} />
		{/if}

		<section class="flex flex-col gap-2.5">
			<div class="flex flex-wrap items-center gap-3.5">
				<h2
					class="m-0 font-display text-[40px] leading-none font-semibold tracking-[-0.04em] break-all text-seal-100 sm:text-[52px] {multisig(
						key.signers.length
					)
						? 'text-glow-seal'
						: ''}"
				>
					{r.name}
				</h2>
				{#if !key.revoked}
					<ReleaseSeal quorum={key.quorum} signers={key.signers.length} />
				{/if}
			</div>
			<span class="text-fg-2">
				Signed on <a
					href="/releases/{key.key}"
					class="font-mono text-fg no-underline hover:text-accent-300">{key.name}</a
				>
				{#if data.previous}· after {data.previous.name}{/if}
				{#if committed}
					· tagged commit from
					<span title={isoDate(committed)}>{relativeTime(committed)}</span>
				{/if}
			</span>
			{#if !key.revoked}
				<CopyInstall
					name={data.name}
					source={{ key: key.key, length: key.length }}
					tag={r.tag}
					pear={data.pear}
					multi={multisig(key.signers.length)}
				/>
			{/if}
		</section>

		<a
			href="/{repo}/{r.commit}/"
			class="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[10px] bg-accent-400 px-4 text-sm font-semibold text-accent-900 no-underline transition-colors hover:bg-accent-300 sm:h-10"
		>
			Browse files at <span class="font-mono">{r.tag}</span>
		</a>

		{#if changes}
			<section
				aria-label="Changes"
				class="overflow-hidden rounded-[18px] bg-surface ring-1 ring-line ring-inset"
			>
				<div
					class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-surface-2 px-5 py-3.5"
				>
					<h3 class="m-0 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">
						{changes.since ? `Changes since ${changes.since.name}` : 'First release'}
					</h3>
					<span class="text-xs text-fg-2">{changesSummary(changes)}</span>
				</div>
				{#if changes.commits.length}
					<div class="px-5 py-1">
						<ChangeList {changes} />
					</div>
				{/if}
				{#if changes.more}
					<a
						href="/{repo}/commits?ref={r.commit}&cursor={changes.more}"
						class="block border-t border-line px-5 py-3 text-[13px] font-medium text-accent-300 no-underline hover:underline"
					>
						Older commits →
					</a>
				{/if}
			</section>
		{/if}

		<section
			aria-label="What was signed"
			class="overflow-hidden rounded-[18px] bg-surface ring-1 ring-line ring-inset"
		>
			<h3
				class="m-0 bg-surface-2 px-5 py-3.5 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase"
			>
				What was signed
			</h3>
			<dl
				class="m-0 grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] px-5 pt-2 pb-3 sm:grid-cols-[160px_minmax(0,1fr)]"
			>
				{#each rows as row (row.k)}
					<dt class="border-b border-white/4 py-[11px] text-fg-2">{row.k}</dt>
					<dd
						class="m-0 truncate border-b border-white/4 py-[11px] font-mono text-[13px] text-fg"
						title={row.v}
					>
						{#if row.href}
							<a href={row.href} class="text-accent-300 no-underline hover:underline">{row.v}</a>
						{:else}
							{row.v}
						{/if}
					</dd>
				{/each}
			</dl>
			<div class="flex flex-col gap-2.5 border-t border-line px-5 py-4">
				<span class="text-xs text-fg-3">
					Signers on this key · {key.quorum} of {key.signers.length} must sign
				</span>
				<ul class="m-0 flex list-none flex-wrap gap-2.5 p-0">
					{#each key.signers as s, i (s.key)}
						<li class="flex min-w-0 items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1">
							<span
								class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold {avatar(
									i
								)}"
								aria-hidden="true">{signerInitials(s)}</span
							>
							<span class="truncate text-[13px] text-fg">{signerName(s)}</span>
							<span class="font-mono text-xs text-fg-3">{shortKey(s.key)}</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>

		{#if previous || next}
			<nav aria-label="Releases" class="flex flex-wrap items-center gap-2.5">
				{#if previous}
					<a
						href={href(previous.tag)}
						class="inline-flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-surface px-3.5 text-[13px] text-fg-2 no-underline ring-1 ring-line ring-inset hover:text-fg sm:flex-none"
					>
						← <span class="truncate font-display font-semibold text-fg">{previous.name}</span>
					</a>
				{/if}
				{#if next}
					<a
						href={href(next.tag)}
						class="inline-flex h-11 min-w-0 flex-1 items-center justify-end gap-2 rounded-[10px] bg-surface px-3.5 text-[13px] text-fg-2 no-underline ring-1 ring-line ring-inset hover:text-fg sm:ml-auto sm:flex-none"
					>
						<span class="truncate font-display font-semibold text-fg">{next.name}</span> →
					</a>
				{/if}
			</nav>
		{/if}
	{/if}
</div>
