<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import GearLogo from '$lib/GearLogo.svelte';

	let { children, data } = $props();

	// Live peer count — SSR gives us the initial value, then an EventSource
	// subscription to /api/events keeps it fresh. Auto-reconnects on drop.
	let peers = $state<number>(data.peers);

	onMount(() => {
		const es = new EventSource('/api/events');
		es.addEventListener('stats', (e) => {
			try {
				const s = JSON.parse((e as MessageEvent).data);
				if (typeof s.peers === 'number') peers = s.peers;
			} catch {
				// malformed payload — drop it
			}
		});
		return () => es.close();
	});

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
	class="sticky top-0 z-10 border-b border-neutral-800 bg-black backdrop-blur"
>
	<div
		class="mx-auto flex max-w-[1100px] items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3"
	>
		<a
			href="/"
			class="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight text-white no-underline"
			aria-label="Gear — home"
		>
			<GearLogo class="text-accent-400" />
		</a>

		<nav class="flex min-w-0 flex-1 gap-1 overflow-x-auto sm:justify-center">
			{#each [{ href: '/', label: 'Repositories' }, { href: '/settings', label: 'Settings' }] as item}
				<a
					href={item.href}
					class="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap no-underline transition-colors sm:px-3
						{isActive(item.href)
						? 'bg-pear-900 text-white'
						: 'text-neutral-400 hover:bg-pear-700/60 hover:text-white'}"
				>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="flex shrink-0 items-center gap-2">
			<div
				class="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 tabular-nums sm:px-2.5"
				title="Active peer connections"
			>
				<span
					class="h-1.5 w-1.5 rounded-full {peers > 0
						? 'animate-pulse-soft bg-accent-400 ring-4 ring-accent-500/20'
						: 'bg-neutral-600'}"
				></span>
				<strong class="font-semibold text-white">{peers}</strong>
				<span class="hidden sm:inline">peer{peers === 1 ? '' : 's'}</span>
			</div>
			<button
				type="button"
				onclick={copyIdentity}
				class="hidden items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 font-mono text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white sm:inline-flex"
				title="Your public key — click to copy"
			>
				<span>{data.identityShort}</span>
				<span class="opacity-60">⧉</span>
			</button>
			<button
				type="button"
				onclick={copyIdentity}
				class="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white sm:hidden"
				title="Your public key — click to copy"
				aria-label="Copy public key"
			>
				<span aria-hidden="true">⧉</span>
			</button>
		</div>
	</div>
</header>

<div class="min-h-[calc(100vh-57px)] bg-neutral-950 text-neutral-200">
	{@render children()}
</div>
