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

	// Live peer count — SSR gives us the initial value, then an EventSource
	// subscription to /api/events keeps it fresh. Auto-reconnects on drop.
	let peers = $state<number>(0);
	let blindPeers = $state<number>(0);

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
				if (typeof s.blindPeers === 'number') blindPeers = s.blindPeers;
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

	// Repo pages live under the library, so Library stays lit everywhere but
	// Settings, Discover and Releases.
	const onSettings = $derived(page.url.pathname.startsWith('/settings'));
	const onDiscover = $derived(page.url.pathname === '/discover');
	const onReleases = $derived(page.url.pathname.startsWith('/releases'));
	const onLibrary = $derived(!onSettings && !onDiscover && !onReleases);

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

{#snippet navIcon(name: string)}
	<svg
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if name === 'library'}
			<rect x="4" y="4" width="7" height="7" rx="1.5" />
			<rect x="13" y="4" width="7" height="7" rx="1.5" />
			<rect x="4" y="13" width="7" height="7" rx="1.5" />
			<rect x="13" y="13" width="7" height="7" rx="1.5" />
		{:else if name === 'discover'}
			<circle cx="12" cy="12" r="9" />
			<path d="m15.5 8.5-2 5-5 2 2-5z" />
		{:else if name === 'releases'}
			<path d="M12 3 5 6v5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6z" />
			<path d="m9 12 2 2 4-4" />
		{:else if name === 'search'}
			<circle cx="11" cy="11" r="7" />
			<path d="m20 20-3.5-3.5" />
		{:else}
			<circle cx="12" cy="12" r="3" />
			<path
				d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"
			/>
		{/if}
	</svg>
{/snippet}

<!--
	Flex column so the content region fills whatever the sticky header leaves,
	at every breakpoint. It used to be min-h-[calc(100vh-90px)], and the header
	is nowhere near 90px tall on desktop — the shortfall showed the body's
	pear-950 through as a green strip along the bottom.
-->
<div class="relative flex min-h-screen flex-col overflow-x-clip bg-neutral-950">
	<div
		aria-hidden="true"
		class="pointer-events-none absolute top-[-320px] left-1/2 h-[640px] w-[1100px] max-w-[200vw] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(35_204_148/0.14),transparent)]"
	></div>

	<header
		class="sticky top-0 z-10 border-b border-line bg-bg/70 pt-[env(safe-area-inset-top)] backdrop-blur-md"
	>
		<div class="flex items-center gap-3 px-4 py-3 sm:gap-5 sm:px-8 sm:py-3.5">
			<a
				href="/"
				class="flex shrink-0 items-center gap-2.5 text-fg no-underline"
				aria-label="Gear — home"
			>
				<GearLogo size={26} class="text-accent-400 drop-shadow-[0_0_8px_rgb(35_204_148/0.6)]" />
				<span class="font-display text-[17px] font-bold tracking-[-0.01em]">gear</span>
			</a>

			<nav aria-label="Main" class="hidden items-center gap-1 sm:flex">
				<a
					href="/"
					class="rounded-lg px-3 py-[7px] text-sm font-medium no-underline transition-colors {onLibrary
						? 'bg-white/6 text-fg'
						: 'text-fg-2 hover:text-fg'}"
					aria-current={onLibrary ? 'page' : undefined}
				>
					Library
				</a>
				<a
					href="/discover"
					class="rounded-lg px-3 py-[7px] text-sm font-medium no-underline transition-colors {onDiscover
						? 'bg-white/6 text-fg'
						: 'text-fg-2 hover:text-fg'}"
					aria-current={onDiscover ? 'page' : undefined}
				>
					Discover
				</a>
				<a
					href="/releases"
					class="rounded-lg px-3 py-[7px] text-sm font-medium no-underline transition-colors {onReleases
						? 'bg-white/6 text-fg'
						: 'text-fg-2 hover:text-fg'}"
					aria-current={onReleases ? 'page' : undefined}
				>
					Releases
				</a>
				<a
					href="/settings"
					class="rounded-lg px-3 py-[7px] text-sm font-medium no-underline transition-colors {onSettings
						? 'bg-white/6 text-fg'
						: 'text-fg-2 hover:text-fg'}"
					aria-current={onSettings ? 'page' : undefined}
				>
					Settings
				</a>
			</nav>

			<button
				type="button"
				onclick={() => (overlayOpen = true)}
				title="Search repositories (⌘K)"
				class="hidden h-[38px] min-w-0 flex-[1_1_320px] cursor-pointer items-center gap-2.5 rounded-[10px] bg-surface-2 px-3 text-left text-fg-3 ring-1 ring-line-strong transition-colors ring-inset hover:text-fg-2 sm:flex"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="7" />
					<path d="m20 20-3.5-3.5" />
				</svg>
				<span class="min-w-0 flex-1 truncate text-sm">Search repositories</span>
				<kbd class="rounded-[5px] bg-white/6 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">⌘K</kbd>
			</button>

			<div class="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
				<div
					class="inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium tabular-nums sm:h-[38px] sm:gap-2.5 sm:pr-3.5 sm:pl-3 sm:text-[13px] {peers >
					0
						? 'bg-accent-400/10 text-accent-100 shadow-glow ring-1 ring-accent-400/35 ring-inset'
						: 'bg-surface-2 text-fg-3 ring-1 ring-line-strong ring-inset'}"
					title="Active peer connections"
				>
					<span
						class="h-2 w-2 rounded-full {peers > 0
							? 'animate-pulse-soft bg-accent-400 shadow-glow-strong'
							: 'bg-neutral-600'}"
					></span>
					<span>
						<b class="font-semibold {peers > 0 ? 'text-white' : 'text-fg-2'}">{peers}</b>
						peer{peers === 1 ? '' : 's'}
					</span>
					{#if blindPeers > 0}
						<span class="hidden text-pear-400 sm:inline" aria-hidden="true">·</span>
						<span class="hidden sm:inline">
							<b class="font-semibold text-white">{blindPeers}</b> blind
						</span>
					{/if}
				</div>
				<button
					type="button"
					onclick={copyIdentity}
					class="tap-44 h-8 w-8 shrink-0 cursor-pointer rounded-full bg-[conic-gradient(from_200deg,#23cc94,#407e62,#fb923c,#23cc94)] p-0.5 sm:h-[38px] sm:w-[38px]"
					title={copiedIdentity
						? 'Copied'
						: `Your public key — click to copy (${data.identityShort})`}
					aria-label="Copy public key"
				>
					<span
						class="flex h-full w-full items-center justify-center rounded-full bg-surface font-mono text-[11px] font-semibold text-fg sm:text-xs"
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
					</span>
				</button>
			</div>
		</div>
	</header>

	<nav
		aria-label="Main"
		class="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-20 grid h-[60px] grid-cols-5 rounded-[22px] bg-surface-3/85 p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.5)] ring-1 ring-line-strong backdrop-blur-lg ring-inset sm:hidden"
	>
		<a
			href="/"
			class="flex flex-col items-center justify-center gap-[3px] rounded-2xl text-[11px] no-underline {onLibrary
				? 'bg-accent-400/12 font-semibold text-accent-300'
				: 'font-medium text-fg-2'}"
			aria-current={onLibrary ? 'page' : undefined}
		>
			{@render navIcon('library')}Library
		</a>
		<a
			href="/discover"
			class="flex flex-col items-center justify-center gap-[3px] rounded-2xl text-[11px] no-underline {onDiscover
				? 'bg-accent-400/12 font-semibold text-accent-300'
				: 'font-medium text-fg-2'}"
			aria-current={onDiscover ? 'page' : undefined}
		>
			{@render navIcon('discover')}Discover
		</a>
		<a
			href="/releases"
			class="flex flex-col items-center justify-center gap-[3px] rounded-2xl text-[11px] no-underline {onReleases
				? 'bg-accent-400/12 font-semibold text-accent-300'
				: 'font-medium text-fg-2'}"
			aria-current={onReleases ? 'page' : undefined}
		>
			{@render navIcon('releases')}Releases
		</a>
		<button
			type="button"
			onclick={() => (overlayOpen = true)}
			class="flex cursor-pointer flex-col items-center justify-center gap-[3px] rounded-2xl text-[11px] font-medium text-fg-2"
		>
			{@render navIcon('search')}Search
		</button>
		<a
			href="/settings"
			class="flex flex-col items-center justify-center gap-[3px] rounded-2xl text-[11px] no-underline {onSettings
				? 'bg-accent-400/12 font-semibold text-accent-300'
				: 'font-medium text-fg-2'}"
			aria-current={onSettings ? 'page' : undefined}
		>
			{@render navIcon('settings')}Settings
		</a>
	</nav>

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
				class="relative z-10 flex max-h-[calc(100vh-6rem)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-surface-2 shadow-[inset_0_0_0_1px_rgb(93_221_173/0.2),0_24px_60px_rgb(0_0_0/0.6)]"
			>
				{#await data.discover}
					<div aria-label="Loading repositories" class="flex flex-col gap-3 p-4">
						<span class="h-11 animate-pulse-soft rounded-xl bg-surface-3"></span>
						{#each { length: 4 }, i (i)}
							<span class="h-16 animate-pulse-soft rounded-lg bg-surface-3/60"></span>
						{/each}
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

	<div class="flex-1 pb-[calc(76px+env(safe-area-inset-bottom))] text-neutral-200 sm:pb-0">
		{@render children()}
	</div>
</div>
