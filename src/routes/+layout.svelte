<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import GearLogo from '$lib/GearLogo.svelte';

	let { children, data } = $props();

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	async function copyIdentity() {
		try {
			await navigator.clipboard.writeText(data.identity);
		} catch {
			// clipboard may be unavailable; ignore
		}
	}
</script>

<svelte:head>
	<title>Gear</title>
	<link rel="icon" type="image/svg+xml" href={favicon} />
</svelte:head>

<header
	class="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-6 border-b border-neutral-800 bg-black px-6 py-3 backdrop-blur"
>
	<a
		href="/"
		class="flex items-center gap-2.5 font-semibold tracking-tight text-white no-underline"
	>
		<GearLogo class="text-accent-400" />
	</a>

	<nav class="flex gap-1 justify-self-center">
		{#each [{ href: '/', label: 'Repositories' }, { href: '/settings', label: 'Settings' }] as item}
			<a
				href={item.href}
				class="rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors
					{isActive(item.href)
					? 'bg-pear-900 text-white'
					: 'text-neutral-400 hover:bg-pear-700/60 hover:text-white'}"
			>
				{item.label}
			</a>
		{/each}
	</nav>

	<div class="flex items-center gap-3 justify-self-end">
		<div
			class="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 tabular-nums"
			title="Active peer connections"
		>
			<span
				class="h-1.5 w-1.5 rounded-full {data.peers > 0
					? 'animate-pulse-soft bg-accent-400 ring-4 ring-accent-500/20'
					: 'bg-neutral-600'}"
			></span>
			<strong class="font-semibold text-white">{data.peers}</strong>
			peer{data.peers === 1 ? '' : 's'}
		</div>
		<button
			type="button"
			onclick={copyIdentity}
			class="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 font-mono text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
			title="Your public key — click to copy"
		>
			<span>{data.identityShort}</span>
			<span class="opacity-60">⧉</span>
		</button>
	</div>
</header>

<div class="min-h-[calc(100vh-57px)] bg-neutral-950 text-neutral-200">
	{@render children()}
</div>
