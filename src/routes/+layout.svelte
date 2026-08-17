<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import GearLogo from '$lib/GearLogo.svelte';
	import Search from '$lib/components/Search.svelte';

	let { children, data } = $props();

	let overlayOpen = $state(false);
	let menuOpen = $state(false);

	const navItems = [
		{ href: '/', label: 'Repos' },
		{ href: '/settings', label: 'Settings' }
	];

	// Live peer count — SSR gives us the initial value, then an EventSource
	// subscription to /api/events keeps it fresh. Auto-reconnects on drop.
	let peers = $state<number>(0);

	// Avatar initials — first two chars of the z32 identity, uppercased.
	// Stable for a given key, so the user can recognise their own peer in
	// a glance once they've seen it once.
	const avatarInitials = $derived((data.identity ?? '').slice(0, 2).toUpperCase() || '··');

	// Copy-feedback — flips for ~1s after a successful copy.
	let copiedIdentity = $state(false);

	onMount(() => {
		function handleGlobalKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				overlayOpen = true;
			} else if (e.key === 'Escape' && overlayOpen) {
				overlayOpen = false;
			}
		}
		document.addEventListener('keydown', handleGlobalKeydown);

		const es = new EventSource('/api/events');
		es.addEventListener('stats', (e) => {
			try {
				const s = JSON.parse((e as MessageEvent).data);
				if (typeof s.peers === 'number') peers = s.peers;
			} catch {
				// malformed payload — drop it
			}
		});
		// An OTA config block arrived — re-run loads so the discover manifest
		// (the search overlay's data) reflects it immediately.
		es.addEventListener('sources', () => invalidateAll());
		return () => {
			es.close();
			document.removeEventListener('keydown', handleGlobalKeydown);
		};
	});

	$effect(() => {
		if (overlayOpen) {
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = '';
			};
		}
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

<!--
	Flex column so the content region fills whatever the sticky header leaves,
	at every breakpoint. It used to be min-h-[calc(100vh-90px)], and the header
	is nowhere near 90px tall on desktop — the shortfall showed the body's
	pear-950 through as a green strip along the bottom.
-->
<div class="flex min-h-screen flex-col bg-neutral-950">
	<header class="sticky top-0 z-10 border-b border-neutral-800 bg-black pt-4 backdrop-blur sm:pt-0">
		<div class="mx-auto max-w-[1100px] px-3 sm:px-6">
			<!--
			Mobile: two lines — logo+peers on top, search bar below.
			Desktop (sm:): single line — logo+nav | search | peers+avatar.
			Achieved via flex-wrap + order utilities.
		-->
			<div
				class="flex flex-wrap items-center gap-x-2 gap-y-2 py-2 sm:flex-nowrap sm:gap-x-3 sm:py-2.5"
			>
				<div class="order-1 flex shrink-0 items-center gap-0.5">
					<a
						href="/"
						class="flex shrink-0 items-center gap-2 pr-1 font-semibold tracking-tight text-white no-underline"
						aria-label="Gear — home"
					>
						<GearLogo class="text-accent-400" />
					</a>
					<div class="mx-1.5 hidden h-4 w-px bg-neutral-800 sm:block"></div>
					<nav class="hidden items-center gap-0.5 sm:flex">
						{#each navItems as item}
							<a
								href={item.href}
								class="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap no-underline transition-colors
								{isActive(item.href)
									? 'bg-pear-900 text-white'
									: 'text-neutral-400 hover:bg-pear-700/60 hover:text-white'}"
							>
								{item.label}
							</a>
						{/each}
					</nav>
				</div>

				<!-- Search trigger — full-width second line on mobile, inline flex-1 on desktop -->
				<button
					type="button"
					onclick={() => (overlayOpen = true)}
					title="Search repositories (⌘K)"
					aria-label="Search repositories"
					class="order-3 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-left transition-colors hover:border-neutral-700 sm:order-2 sm:flex-1"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="shrink-0 text-neutral-600"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.35-4.35" />
					</svg>
					<span class="flex-1 font-mono text-[13px] text-neutral-600">Search repositories…</span>
					<kbd
						class="hidden shrink-0 rounded border border-neutral-800 bg-neutral-800/60 px-1.5 py-0.5 font-sans text-[10px] text-neutral-600 sm:inline"
						>⌘K</kbd
					>
				</button>

				<div class="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0">
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
						class="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-accent-500/40 bg-accent-500/15 font-mono text-[11px] font-semibold tracking-wide text-accent-200 transition-colors hover:border-accent-400 hover:bg-accent-500/25 hover:text-accent-100"
						title={copiedIdentity
							? 'Copied'
							: `Your public key — click to copy (${data.identityShort})`}
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
					<button
						type="button"
						onclick={() => (menuOpen = !menuOpen)}
						aria-label="Menu"
						aria-expanded={menuOpen}
						class="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-800 text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white sm:hidden"
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							aria-hidden="true"
						>
							{#if menuOpen}
								<path d="M6 6l12 12M18 6L6 18" />
							{:else}
								<path d="M4 7h16M4 12h16M4 17h16" />
							{/if}
						</svg>
					</button>
				</div>
			</div>

			{#if menuOpen}
				<nav class="flex flex-col gap-0.5 pb-3 sm:hidden">
					{#each navItems as item}
						<a
							href={item.href}
							onclick={() => (menuOpen = false)}
							class="rounded-md px-2.5 py-2 text-sm font-medium no-underline transition-colors
							{isActive(item.href)
								? 'bg-pear-900 text-white'
								: 'text-neutral-400 hover:bg-pear-700/60 hover:text-white'}"
						>
							{item.label}
						</a>
					{/each}
				</nav>
			{/if}
		</div>
	</header>

	{#if overlayOpen}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Search repositories"
			tabindex="-1"
			class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16"
			onkeydown={(e) => {
				if (e.key === 'Escape') overlayOpen = false;
			}}
		>
			<div
				class="absolute inset-0 bg-black/60 backdrop-blur-sm"
				role="button"
				tabindex="-1"
				aria-label="Close search"
				onclick={() => (overlayOpen = false)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') overlayOpen = false;
				}}
			></div>
			<div
				class="relative z-10 flex max-h-[calc(100vh-6rem)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl"
			>
				{#await data.discover}
					<div class="px-6 py-10 text-center">
						<span
							class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-neutral-800 border-t-accent-400"
						></span>
					</div>
				{:then repos}
					<Search
						{repos}
						library={data.repoNames}
						autofocus={true}
						onclose={() => (overlayOpen = false)}
					/>
				{/await}
			</div>
		</div>
	{/if}

	<div class="flex-1 text-neutral-200">
		{@render children()}
	</div>
</div>
