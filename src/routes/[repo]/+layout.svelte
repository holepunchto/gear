<script lang="ts">
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { enhance } from '$app/forms';
	import CommitMessage from '$lib/components/CommitMessage.svelte';
	import { relativeTime, isoDate, isRecent } from '$lib/time';

	let { children, data }: { children: Snippet; data: { repo: any } } = $props();

	const repo = $derived(data.repo);

	// Fork UI state — we capture errors directly in the enhance callback
	// since the form action lives on a different route than the pages the
	// user is typically viewing (e.g. /[repo]/[ref]/...).
	let showForkForm = $state(false);
	let submittingFork = $state(false);
	let forkName = $state('');
	let forkError = $state<string | null>(null);

	// "Forked from" badge — server doesn't track parentage yet, so we keep
	// a small client-side map in localStorage until gip-transport exposes it.
	// Shape: { [childName]: parentName }
	const FORK_MAP_KEY = 'gear:forks';
	let forkedFrom = $state<string | null>(null);

	function readForkMap(): Record<string, string> {
		try {
			return JSON.parse(localStorage.getItem(FORK_MAP_KEY) ?? '{}');
		} catch {
			return {};
		}
	}

	function writeForkMap(map: Record<string, string>) {
		try {
			localStorage.setItem(FORK_MAP_KEY, JSON.stringify(map));
		} catch {
			// storage quota / unavailable — non-fatal
		}
	}

	$effect(() => {
		// Keep in sync with the current repo name, and record the parent
		// relationship if we landed here from a successful fork redirect.
		const name = data.repo.name;
		if (typeof localStorage === 'undefined') return;

		const parentFromQuery = page.url.searchParams.get('forkedFrom');
		const map = readForkMap();

		if (parentFromQuery && !map[name]) {
			map[name] = parentFromQuery;
			writeForkMap(map);
		}

		forkedFrom = map[name] ?? null;
	});

	// Live numbers that overlay the server snapshot. Start matching the load
	// and get updated by EventSource. Keep them in sync whenever data.repo
	// changes (route navigation).
	let liveLength = $state(data.repo.length);
	let livePeers = $state(data.repo.peers);
	let pushFlash = $state(false);

	$effect(() => {
		// Re-seed when SvelteKit revalidates the layout load.
		liveLength = data.repo.length;
		livePeers = data.repo.peers;
	});

	onMount(() => {
		const name = untrack(() => data.repo.name);
		const es = new EventSource(`/api/events/${encodeURIComponent(name)}`);

		es.addEventListener('repo', (e) => {
			try {
				const s = JSON.parse((e as MessageEvent).data);
				if (typeof s.length === 'number') liveLength = s.length;
				if (typeof s.peers === 'number') livePeers = s.peers;
			} catch {
				// drop malformed payload
			}
		});

		es.addEventListener('append', () => {
			// Blocks landed — someone pushed (or we did). Flash the counter
			// and ask SvelteKit to re-run the load so refs/HEAD refresh too.
			pushFlash = true;
			setTimeout(() => (pushFlash = false), 1500);
			invalidate('repo:' + name).catch(() => {});
		});

		return () => es.close();
	});

	// Active ref, resolved by the layout load (path param, ?ref=, or HEAD).
	const currentRef = $derived(repo.ref?.name ?? repo.head ?? 'main');
	// Query string that keeps commit links scoped when off the head branch.
	const refQuery = $derived(
		repo.ref && !repo.ref.isHead ? `?ref=${encodeURIComponent(repo.ref.name)}` : ''
	);

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
				!p.endsWith('/branches') &&
				!p.endsWith('/tags') &&
				!p.endsWith('/commits') &&
				!p.endsWith('/settings')
		},
		{
			label: 'Commits',
			href: `/${repo.name}/commits${refQuery}`,
			count: repo.commitCount?.capped
				? `${repo.commitCount.count}+`
				: (repo.commitCount?.count ?? undefined),
			match: (p: string) => p.endsWith('/commits')
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

<main class="mx-auto max-w-[1100px] px-4 pt-2 pb-20 sm:px-6 sm:pt-8">
	<nav class="mb-3.5 flex items-center gap-1 text-sm text-neutral-500">
		<a href="/" class="text-neutral-500 no-underline hover:text-accent-400"> Repositories </a>
		<span class="text-neutral-700">/</span>
		{#if repo.ref && !repo.ref.isHead}
			<a href="/{repo.name}" class="text-neutral-500 no-underline hover:text-accent-400">
				{repo.name}
			</a>
			<span class="text-neutral-700">/</span>
			<span class="font-mono font-medium text-white">{repo.ref.name}</span>
		{:else}
			<span class="font-medium text-white">{repo.name}</span>
		{/if}
	</nav>

	{#if repo.ref && !repo.ref.isHead}
		<!-- Ref strip — a quiet reminder that the page is scoped to this ref,
			with the way back. -->
		<div
			class="mb-4 inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-300"
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="shrink-0 text-neutral-500"
				aria-hidden="true"
			>
				{#if repo.ref.kind === 'tag'}
					<path
						d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
					/>
					<line x1="7" x2="7.01" y1="7" y2="7" />
				{:else}
					<line x1="6" x2="6" y1="3" y2="15" />
					<circle cx="18" cy="6" r="3" />
					<circle cx="6" cy="18" r="3" />
					<path d="M18 9a9 9 0 0 1-9 9" />
				{/if}
			</svg>
			<span class="font-mono font-medium text-white">{repo.ref.name}</span>
			<span class="text-neutral-700">·</span>
			<a
				href="/{repo.name}"
				class="text-neutral-400 no-underline transition-colors hover:text-accent-300"
			>
				Back to {repo.head ?? 'default branch'}
			</a>
		</div>
	{/if}

	<header class="mb-6 grid grid-cols-1 items-start gap-5 md:grid-cols-[1fr_auto] md:gap-6">
		<div class="min-w-0">
			<!-- Title row — Owner pill is pinned to the left of the name so it
				always sits in the same spot regardless of name length. We
				have more room here than in the list, so use a proper filled
				pill rather than a tiny kicker. -->
			<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
				{#if repo.writable}
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-accent-500/40 bg-accent-500/15 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-accent-300 uppercase"
						title="You are the writer of this repo"
					>
						<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4Z" />
						</svg>
						Owner
					</span>
				{/if}
				<h1 class="m-0 text-xl font-semibold tracking-tight break-all text-white sm:text-2xl">
					{repo.name}
				</h1>
			</div>
			{#if forkedFrom}
				<a
					href="/{forkedFrom}"
					class="mt-1.5 inline-flex items-center gap-1.5 text-xs text-neutral-500 no-underline hover:text-accent-300"
					title="This repo was forked from {forkedFrom}"
				>
					<svg
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="6" cy="5" r="2" />
						<circle cx="18" cy="5" r="2" />
						<circle cx="12" cy="19" r="2" />
						<path d="M6 7v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
						<path d="M12 13v4" />
					</svg>
					Forked from <span class="font-medium text-neutral-300">{forkedFrom}</span>
				</a>
			{/if}
			<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-neutral-500">
				<span
					class="transition-colors duration-500 {pushFlash ? 'text-apricot-300' : ''}"
					title={pushFlash ? 'New blocks just landed' : undefined}
				>
					<strong
						class="font-semibold tabular-nums {pushFlash ? 'text-apricot-200' : 'text-neutral-200'}"
					>
						{liveLength.toLocaleString()}
					</strong>
					block{liveLength === 1 ? '' : 's'}
				</span>
				<span class="text-neutral-700">·</span>
				<span
					class="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-xs"
				>
					<span
						class="h-1.5 w-1.5 rounded-full {livePeers > 0
							? 'animate-pulse-soft bg-accent-400 ring-4 ring-accent-500/20'
							: 'bg-neutral-600'}"
					></span>
					<strong class="font-semibold text-white tabular-nums">{livePeers}</strong>
					peer{livePeers === 1 ? '' : 's'}
				</span>
				{#if repo.commitCount && repo.commitCount.count > 0}
					<span class="text-neutral-700">·</span>
					<a
						href="/{repo.name}/commits{refQuery}"
						class="text-neutral-400 no-underline hover:text-accent-300"
					>
						<strong class="font-semibold text-neutral-200 tabular-nums">
							{repo.commitCount.capped ? `${repo.commitCount.count}+` : repo.commitCount.count}
						</strong>
						commit{repo.commitCount.count === 1 ? '' : 's'}
					</a>
				{/if}
			</div>
		</div>

		<div class="flex flex-wrap items-stretch gap-2">
			<div
				class="flex max-w-full min-w-0 items-stretch overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 font-mono text-xs md:inline-flex md:max-w-[460px]"
			>
				<span
					class="shrink-0 border-r border-neutral-800 bg-neutral-950 px-2.5 py-1.5 font-sans text-xs font-medium text-neutral-400"
				>
					Clone
				</span>
				<span class="min-w-0 flex-1 truncate px-2.5 py-1.5 text-neutral-100" title={repo.url}>
					{shortUrl}
				</span>
				<button
					type="button"
					onclick={copyUrl}
					class="shrink-0 border-l border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
					aria-label="Copy URL"
				>
					⧉
				</button>
			</div>
			<button
				type="button"
				onclick={() => {
					showForkForm = !showForkForm;
					if (showForkForm && !forkName) forkName = `${repo.name}-fork`;
				}}
				class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:border-neutral-600 hover:bg-neutral-800"
				aria-expanded={showForkForm}
				title="Create a writable copy of this repo"
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
					aria-hidden="true"
				>
					<circle cx="6" cy="5" r="2.5" />
					<circle cx="18" cy="5" r="2.5" />
					<circle cx="12" cy="19" r="2.5" />
					<path d="M6 7.5v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3" />
					<path d="M12 12.5v4" />
				</svg>
				Fork
			</button>
		</div>
	</header>

	{#if showForkForm}
		<form
			method="POST"
			action="/{repo.name}?/fork"
			use:enhance={() => {
				submittingFork = true;
				forkError = null;
				return async ({ result }) => {
					submittingFork = false;
					if (result.type === 'redirect') {
						// Success — follow the redirect; localStorage picks up
						// the parent relationship via the ?forkedFrom= query.
						await goto(result.location);
						showForkForm = false;
					} else if (result.type === 'failure') {
						const f = result.data?.fork as { error?: string } | undefined;
						forkError = f?.error ?? 'Fork failed';
					} else if (result.type === 'error') {
						forkError = result.error?.message ?? 'Fork failed';
					}
				};
			}}
			class="mb-5 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-4 sm:grid-cols-[1fr_auto_auto]"
		>
			<div class="min-w-0 sm:col-span-3">
				<p class="m-0 text-sm text-neutral-300">
					Fork <strong class="font-semibold text-white">{repo.name}</strong> into a new writable repository.
					Refs and objects are copied over — you'll be the writer.
				</p>
			</div>
			<input
				type="text"
				name="name"
				bind:value={forkName}
				placeholder="{repo.name}-fork"
				autocomplete="off"
				required
				pattern="[a-zA-Z0-9_\-]+"
				class="min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={submittingFork}
				class="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-400 disabled:opacity-60"
			>
				{submittingFork ? 'Forking…' : 'Create fork'}
			</button>
			<button
				type="button"
				onclick={() => (showForkForm = false)}
				class="inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-700 bg-transparent px-3.5 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
			>
				Cancel
			</button>
			{#if forkError}
				<p class="m-0 text-sm text-red-400 sm:col-span-3">{forkError}</p>
			{/if}
		</form>
	{/if}

	{#if repo.refCommit}
		{@const c = repo.refCommit}
		<!-- Tip commit of the active ref — what GitHub shows under the clone
			bar. Apricot accent for "fresh" (within 24h) so the eye lands on
			activity without misreading it as an error. -->
		<a
			href="/{repo.name}/commits{refQuery}"
			class="mb-3 flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 no-underline transition-colors hover:border-neutral-700 hover:bg-neutral-800/60 sm:px-4"
			title="View commit history"
		>
			<div
				class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full {isRecent(c.timestamp)
					? 'bg-apricot-500/15 text-apricot-300 ring-1 ring-apricot-500/30'
					: 'bg-neutral-800 text-neutral-400'}"
				aria-hidden="true"
			>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3" />
					<path d="M3 12h6" />
					<path d="M15 12h6" />
				</svg>
			</div>
			<div class="min-w-0 flex-1">
				<div class="text-[13.5px]">
					<CommitMessage parsed={c.message} variant="inline" />
				</div>
				<div class="mt-0.5 text-[11.5px] text-neutral-500">
					<span class="text-neutral-300">{c.author ?? 'unknown'}</span>
					committed
					<span
						class="{isRecent(c.timestamp) ? 'text-apricot-300' : 'text-neutral-400'}"
						title={isoDate(c.timestamp)}
					>
						{relativeTime(c.timestamp)}
					</span>
					<span class="ml-2 hidden font-mono text-neutral-600 sm:inline">
						{c.oid.slice(0, 7)}
					</span>
				</div>
			</div>
		</a>
	{/if}

	<nav class="mb-5 flex gap-1 overflow-x-auto border-b border-neutral-800">
		{#each tabs as tab}
			{@const active = tab.match(page.url.pathname)}
			<a
				href={tab.href}
				class="-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap no-underline transition-colors
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
