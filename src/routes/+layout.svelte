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

	// Avatar initials — first two chars of the z32 identity, uppercased.
	// Stable for a given key, so the user can recognise their own peer in
	// a glance once they've seen it once.
	const avatarInitials = $derived(
		(data.identity ?? '').slice(0, 2).toUpperCase() || '··'
	);

	// Copy-feedback — flips for ~1s after a successful copy.
	let copiedIdentity = $state(false);

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
			copiedIdentity = true;
			setTimeout(() => (copiedIdentity = false), 1200);
		} catch {
			// clipboard may be unavailable; ignore
		}
	}
</script>

<svelte:head>
	<title>Gear</title>
	<link rel="icon" type="image/svg+xml" href={favicon} />
</svelte:head>

<header class="sticky top-0 z-10 border-b border-neutral-800 bg-black backdrop-blur">
	<!-- 3-column grid keeps the nav truly centered relative to the viewport,
		not just centered within whatever space the brand and right group
		leave over. The auto-sized middle column hugs the nav while the two
		1fr columns pad equally on each side. -->
	<div
		class="mx-auto grid max-w-[1100px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3"
	>
		<a
			href="/"
			class="flex shrink-0 items-center gap-2.5 justify-self-start font-semibold tracking-tight text-white no-underline"
			aria-label="Gear — home"
		>
			<GearLogo class="text-accent-400" />
		</a>

		<nav class="flex min-w-0 max-w-full justify-self-center gap-1 overflow-x-auto">
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

		<div class="flex items-center gap-2 justify-self-end">
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
			<!-- Identity avatar — derived from the first 2 chars of the z32
				public key. Stable per identity so the user recognises it,
				and clicking copies the full key. We swap to a checkmark
				briefly after a successful copy. -->
			<button
				type="button"
				onclick={copyIdentity}
				class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-500/40 bg-accent-500/15 font-mono text-[11px] font-semibold tracking-wide text-accent-200 transition-colors hover:border-accent-400 hover:bg-accent-500/25 hover:text-accent-100"
				title={copiedIdentity ? 'Copied' : `Your public key — click to copy (${data.identityShort})`}
				aria-label="Copy public key"
			>
				{#if copiedIdentity}
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M5 13l4 4L19 7" />
					</svg>
				{:else}
					<span aria-hidden="true">{avatarInitials}</span>
				{/if}
			</button>
		</div>
	</div>
</header>

<div class="min-h-[calc(100vh-57px)] bg-neutral-950 text-neutral-200">
	{@render children()}
</div>
