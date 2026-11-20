<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';
	import ReleaseSeal from '$lib/components/releases/ReleaseSeal.svelte';
	import Revoked from '$lib/components/releases/Revoked.svelte';
	import ChangeList from '$lib/components/releases/ChangeList.svelte';
	import KeyShare from '$lib/components/releases/KeyShare.svelte';
	import CopyInstall from '$lib/components/releases/CopyInstall.svelte';
	import {
		avatar,
		changesSummary,
		liveReleases,
		multisig,
		shortKey,
		signerInitials,
		signerName,
		tagHref
	} from '$lib/releases';
	import { relativeTime, isoDate } from '$lib/time';

	let { data }: PageProps = $props();

	onMount(liveReleases);

	const key = $derived(data.key);
	const r = $derived(data.release);
	const changes = $derived(data.changes);
	// The repo in the library this release came from, or null.
	const repo = $derived(changes?.repo ?? null);
	// The release commit's own time, when the walk read it.
	const committed = $derived(
		changes?.commits[0]?.oid === r.commit ? changes.commits[0].timestamp : null
	);

	const rows = $derived([
		{ k: 'Tag', v: r.tag, href: repo && `/${repo}/${r.commit}/` },
		{ k: 'Commit', v: r.commit, href: repo && `/${repo}/commit/${r.commit}` },
		{ k: 'Tree', v: r.tree, href: repo && `/${repo}/${r.commit}/` },
		{
			k: 'Signed repo',
			v: `${repo ?? data.name} up to length ${key.length}`,
			href: repo && `/${repo}`
		},
		{
			k: 'Signed before it',
			v: data.previous?.name ?? 'nothing older on this key',
			href: data.previous && tagHref(key.key, data.previous.tag)
		}
	]);
</script>

<svelte:head>
	<title>{r.name} · {key.name} · Gear</title>
</svelte:head>

<main class="mx-auto flex max-w-[960px] flex-col gap-6 px-4 pt-6 pb-20 sm:px-8 sm:pt-7">
	<nav class="flex min-w-0 items-center gap-2 text-[13px] text-fg-3">
		<a href="/releases" class="tap-44 shrink-0 text-fg-2 no-underline hover:text-accent-300">
			Release keys
		</a>
		<span>/</span>
		<a
			href="/releases/{key.key}"
			class="tap-44 truncate font-mono text-fg-2 no-underline hover:text-accent-300"
		>
			{key.name}
		</a>
		<span>/</span>
		<span class="shrink-0 font-mono text-fg-2">{r.name}</span>
	</nav>

	{#if key.revoked}
		<Revoked {key} />
	{/if}

	<section class="flex flex-col gap-2.5">
		<div class="flex flex-wrap items-center gap-3.5">
			<h1
				class="m-0 font-display text-[48px] leading-none font-semibold tracking-[-0.04em] break-all text-seal-100 sm:text-[64px] {multisig(
					key.signers.length
				)
					? 'text-glow-seal'
					: ''}"
			>
				{r.name}
			</h1>
			{#if !key.revoked}
				<ReleaseSeal quorum={key.quorum} signers={key.signers.length} />
			{/if}
		</div>
		<span class="text-fg-2">
			<span class="font-mono text-fg">{key.name}</span> · signed
			{#if data.previous}· after {data.previous.name}{/if}
			{#if committed}
				· tagged commit from
				<span title={isoDate(committed)}>{relativeTime(committed)}</span>
			{/if}
		</span>
		<div class="flex flex-wrap items-center gap-1.5">
			{#if !key.revoked}
				<CopyInstall
					name={data.name}
					source={{ key: key.key, length: key.length }}
					tag={r.tag}
					pear={data.pear}
				/>
			{/if}
			<KeyShare keyText={key.key} share={key.share} />
		</div>
	</section>

	{#if repo}
		<div class="flex flex-wrap gap-2.5">
			<a
				href="/{repo}/{r.commit}/"
				class="inline-flex h-11 flex-[1_1_auto] items-center justify-center gap-2 rounded-[10px] bg-accent-400 px-4 text-sm font-semibold text-accent-900 no-underline transition-colors hover:bg-accent-300 sm:h-10 sm:flex-none"
			>
				Browse files at <span class="font-mono">{r.tag}</span>
			</a>
			<a
				href="/{repo}/releases"
				class="inline-flex h-11 flex-[1_1_auto] items-center justify-center rounded-[10px] bg-surface-3 px-3.5 text-sm font-medium text-fg no-underline ring-1 ring-line-strong ring-inset hover:bg-surface-4 sm:h-10 sm:flex-none"
			>
				{repo} releases
			</a>
		</div>
	{:else}
		<section
			aria-label="Repo"
			class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
		>
			<p class="m-0 min-w-0 flex-[1_1_280px] text-sm text-fg-2">
				<span class="font-mono text-fg">{data.name}</span> isn't in your library. Add it to browse this
				release's files and see what changed.
			</p>
			<form method="POST" action="/?/add" class="flex-[1_1_auto] sm:flex-none">
				<input type="hidden" name="url" value={data.url} />
				<button
					type="submit"
					class="h-11 w-full cursor-pointer rounded-[10px] bg-accent-400 px-4 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-300 sm:h-10 sm:w-auto"
				>
					Add repo
				</button>
			</form>
		</section>
	{/if}

	{#if changes}
		<section
			aria-label="Changes"
			class="overflow-hidden rounded-[18px] bg-surface ring-1 ring-line ring-inset"
		>
			<div
				class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-surface-2 px-5 py-3.5"
			>
				<h2 class="m-0 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">
					{changes.since ? `Changes since ${changes.since.name}` : 'First release'}
				</h2>
				<span class="text-xs text-fg-2">{changesSummary(changes)}</span>
			</div>
			{#if changes.commits.length}
				<div class="px-5 py-1">
					<ChangeList {changes} />
				</div>
			{/if}
			{#if changes.more}
				<a
					href="/{changes.repo}/commits?ref={r.commit}&cursor={changes.more}"
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
		<h2
			class="m-0 bg-surface-2 px-5 py-3.5 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase"
		>
			What was signed
		</h2>
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

	<nav aria-label="Releases" class="flex flex-wrap items-center gap-2.5">
		{#if data.previous}
			<a
				href={tagHref(key.key, data.previous.tag)}
				class="inline-flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-surface px-3.5 text-[13px] text-fg-2 no-underline ring-1 ring-line ring-inset hover:text-fg sm:flex-none"
			>
				← <span class="truncate font-display font-semibold text-fg">{data.previous.name}</span>
			</a>
		{/if}
		{#if data.next}
			<a
				href={tagHref(key.key, data.next.tag)}
				class="inline-flex h-11 min-w-0 flex-1 items-center justify-end gap-2 rounded-[10px] bg-surface px-3.5 text-[13px] text-fg-2 no-underline ring-1 ring-line ring-inset hover:text-fg sm:flex-none"
			>
				<span class="truncate font-display font-semibold text-fg">{data.next.name}</span> →
			</a>
		{/if}
		<a
			href="/releases/{key.key}"
			class="tap-44 basis-full text-[13px] text-accent-300 no-underline hover:underline sm:ml-auto sm:basis-auto"
		>
			All releases on <span class="font-mono">{key.name}</span>
		</a>
	</nav>
</main>
