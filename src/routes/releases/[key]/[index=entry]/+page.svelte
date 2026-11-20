<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';
	import SeatDots from '$lib/components/releases/SeatDots.svelte';
	import { liveReleases, shortKey } from '$lib/releases';

	let { data }: PageProps = $props();

	onMount(liveReleases);

	const key = $derived(data.key);
	const r = $derived(data.release);
	// Links into the repo only when it is the one this key releases from and
	// it is in the library.
	const repo = $derived(key.repo?.key === r.repo.key ? key.repo.name : null);

	const rows = $derived([
		{ k: 'Tag', v: r.tag, href: repo && `/${repo}/${r.tag}/` },
		{ k: 'Commit', v: r.commit, href: repo && `/${repo}/commit/${r.commit}` },
		{ k: 'Tree hash', v: r.tree, href: null },
		{
			k: 'Repo at length',
			v: `${repo ?? shortKey(r.repo.key)} @ ${r.repo.length}`,
			href: repo && `/${repo}`
		},
		{
			k: 'Previous release',
			v:
				r.index === 0
					? 'none, this is the first'
					: `#${r.index - 1} · ${data.previous?.name ?? ''}`,
			href: r.index === 0 ? null : `/releases/${key.key}/${r.index - 1}`
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
		<span class="shrink-0 font-mono text-fg-2">#{r.index}</span>
	</nav>

	<section class="flex flex-col gap-2.5">
		<div class="flex flex-wrap items-center gap-3.5">
			<h1
				class="m-0 font-display text-[48px] leading-none font-semibold tracking-[-0.04em] break-all text-fg sm:text-[64px]"
			>
				{r.name}
			</h1>
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-accent-400/12 px-3 py-[5px] text-xs font-semibold text-accent-300"
			>
				<SeatDots n={key.signers.length} filled={key.quorum} />
				Signed release
			</span>
		</div>
		<span class="text-fg-2">
			<span class="font-mono text-fg">{key.name}</span> · entry #{r.index} of {key.length} ·
			{key.quorum} of {key.signers.length} signed
		</span>
	</section>

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
	</section>
</main>
