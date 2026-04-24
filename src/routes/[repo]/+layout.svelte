<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children, data }: { children: Snippet; data: { repo: any } } = $props();

	const repo = $derived(data.repo);

	// current ref (from URL if present, else HEAD)
	const currentRef = $derived((page.params.ref as string | undefined) ?? repo.head ?? 'main');

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(repo.url);
		} catch {}
	}

	const tabs = $derived([
		{
			label: 'Files',
			href: `/${repo.name}/${currentRef}/`,
			match: (p: string) =>
				!p.endsWith('/branches') && !p.endsWith('/tags') && !p.endsWith('/settings')
		},
		{
			label: 'Branches',
			href: `/${repo.name}/branches`,
			count: repo.branches.length,
			match: (p: string) => p.endsWith('/branches')
		},
		{
			label: 'Tags',
			href: `/${repo.name}/tags`,
			count: repo.tags.length,
			match: (p: string) => p.endsWith('/tags')
		}
	]);

	const shortUrl = $derived.by(() => {
		const m = repo.url.match(/^(git\+pear:\/\/[^.]+\.[^.]+\.)([^/]+)(\/.+)$/);
		if (!m) return repo.url;
		const [, head, key, tail] = m;
		return head + key.slice(0, 8) + '…' + key.slice(-4) + tail;
	});
</script>

<svelte:head>
	<title>{repo.name} · Gear</title>
</svelte:head>

<main class="mx-auto max-w-[1100px] px-6 pt-8 pb-20">
	<nav class="mb-3.5 flex items-center gap-1 text-sm text-neutral-500">
		<a href="/" class="text-neutral-500 no-underline hover:text-accent-400"> Repositories </a>
		<span class="text-neutral-700">/</span>
		<span class="font-medium text-white">{repo.name}</span>
	</nav>

	<header class="mb-6 grid grid-cols-[1fr_auto] items-start gap-6">
		<div>
			<h1 class="m-0 text-2xl font-semibold tracking-tight text-white">
				{repo.name}
				{#if repo.writable}
					<span
						class="ml-2 rounded-full bg-accent-500/15 px-2 py-0.5 align-middle text-[11px] font-semibold tracking-wider text-accent-300 uppercase"
					>
						Owner
					</span>
				{/if}
			</h1>
			<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-neutral-500">
				<span>
					<strong class="font-semibold text-neutral-200">{repo.length.toLocaleString()}</strong>
					block{repo.length === 1 ? '' : 's'}
				</span>
				<span class="text-neutral-700">·</span>
				<span
					class="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-xs"
				>
					<span
						class="h-1.5 w-1.5 rounded-full {repo.peers > 0
							? 'animate-pulse-soft bg-accent-400 ring-4 ring-accent-500/20'
							: 'bg-neutral-600'}"
					></span>
					<strong class="font-semibold text-white">{repo.peers}</strong>
					peer{repo.peers === 1 ? '' : 's'}
				</span>
			</div>
		</div>

		<div
			class="inline-flex items-center overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 font-mono text-xs"
		>
			<span
				class="border-r border-neutral-800 bg-neutral-950 px-2.5 py-1.5 font-sans text-xs font-medium text-neutral-400"
			>
				Clone
			</span>
			<span
				class="truncate px-2.5 py-1.5 text-neutral-100"
				style="max-width: 420px"
				title={repo.url}
			>
				{shortUrl}
			</span>
			<button
				type="button"
				onclick={copyUrl}
				class="border-l border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
				aria-label="Copy URL"
			>
				⧉
			</button>
		</div>
	</header>

	<nav class="mb-5 flex gap-1 border-b border-neutral-800">
		{#each tabs as tab}
			{@const active = tab.match(page.url.pathname)}
			<a
				href={tab.href}
				class="-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium no-underline transition-colors
					{active ? 'border-accent-500 text-white' : 'border-transparent text-neutral-400 hover:text-white'}"
			>
				{tab.label}
				{#if tab.count !== undefined}
					<span
						class="ml-1 inline-block rounded-full bg-neutral-800 px-1.5 py-0.5 text-[11px] font-medium text-neutral-400"
					>
						{tab.count}
					</span>
				{/if}
			</a>
		{/each}
	</nav>

	{@render children()}
</main>
