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

	let cloneOpen = $state(false);
	let cloneCopied = $state(false);
	let cloneEl = $state<HTMLElement>();
	const cloneCommand = $derived(`git clone ${repo.url}`);

	$effect(() => {
		if (!cloneOpen) return;
		const onClick = (e: MouseEvent) => {
			if (!cloneEl?.contains(e.target as Node)) cloneOpen = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') cloneOpen = false;
		};
		document.addEventListener('click', onClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('click', onClick);
			document.removeEventListener('keydown', onKey);
		};
	});

	async function copyClone() {
		try {
			await navigator.clipboard.writeText(cloneCommand);
			cloneCopied = true;
			setTimeout(() => (cloneCopied = false), 1500);
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
				!p.endsWith('/settings') &&
				!p.includes('/commit/')
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

<main class="mx-auto max-w-[1280px] px-4 pt-4 pb-20 sm:px-8 sm:pt-9">
	<nav class="mb-3.5 flex items-center gap-1 text-sm text-neutral-500">
		<a href="/" class="text-neutral-500 no-underline hover:text-accent-400"> Library </a>
		<span class="text-neutral-700">/</span>
		{#if page.params.oid}
			<a href="/{repo.name}" class="text-neutral-500 no-underline hover:text-accent-400">
				{repo.name}
			</a>
			<span class="text-neutral-700">/</span>
			<span class="font-mono font-medium text-white">{page.params.oid.slice(0, 10)}</span>
		{:else if repo.ref && !repo.ref.isHead}
			<a href="/{repo.name}" class="text-neutral-500 no-underline hover:text-accent-400">
				{repo.name}
			</a>
			<span class="text-neutral-700">/</span>
			<span class="font-mono font-medium text-white">{repo.ref.name}</span>
		{:else}
			<span class="font-medium text-white">{repo.name}</span>
		{/if}
	</nav>

	<header class="mb-7 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
		<div class="flex min-w-0 flex-[1_1_520px] flex-col gap-3.5">
			<div class="flex flex-wrap items-center gap-x-3.5 gap-y-2">
				<h1
					class="m-0 font-display text-[32px] leading-none font-semibold tracking-[-0.03em] break-all text-fg sm:text-[44px]"
				>
					{repo.name}
				</h1>
				{#if repo.writable}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-accent-400/12 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-accent-300 uppercase"
						title="You are the writer of this repo"
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
						</svg>
						Owner
					</span>
				{/if}
			</div>
			{#if forkedFrom}
				<a
					href="/{forkedFrom}"
					class="inline-flex items-center gap-1.5 self-start text-xs text-fg-3 no-underline hover:text-accent-300"
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
					Forked from <span class="font-medium text-fg-2">{forkedFrom}</span>
				</a>
			{/if}
			<div class="flex flex-wrap items-center gap-x-[22px] gap-y-1 pt-1 text-[13px] text-fg-2">
				<span
					class="transition-colors duration-500 {pushFlash ? 'text-apricot-300' : ''}"
					title={pushFlash ? 'New blocks just landed' : undefined}
				>
					<b class="font-semibold tabular-nums {pushFlash ? 'text-apricot-200' : 'text-fg'}">
						{liveLength.toLocaleString()}
					</b>
					block{liveLength === 1 ? '' : 's'}
				</span>
				<span class="inline-flex items-center gap-1.5">
					<span
						class="h-1.5 w-1.5 rounded-full {livePeers > 0
							? 'animate-pulse-soft bg-accent-400 shadow-glow-strong'
							: 'bg-neutral-600'}"
					></span>
					<b class="font-semibold text-fg tabular-nums">{livePeers}</b>
					peer{livePeers === 1 ? '' : 's'}
				</span>
				{#if repo.commitCount && repo.commitCount.count > 0}
					<a href="/{repo.name}/commits{refQuery}" class="text-fg-2 no-underline hover:text-accent-300">
						<b class="font-semibold text-fg tabular-nums">
							{repo.commitCount.capped ? `${repo.commitCount.count}+` : repo.commitCount.count}
						</b>
						commit{repo.commitCount.count === 1 ? '' : 's'}
					</a>
				{/if}
			</div>
		</div>

		<div class="relative flex w-full items-center gap-2.5 sm:w-auto" bind:this={cloneEl}>
			<button
				type="button"
				onclick={() => {
					showForkForm = !showForkForm;
					if (showForkForm && !forkName) forkName = `${repo.name}-fork`;
				}}
				class="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-surface-3 px-3.5 text-sm font-medium text-fg ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-4 sm:flex-none"
				aria-expanded={showForkForm}
				title="Create a writable copy of this repo"
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
					<circle cx="6" cy="5" r="2" />
					<circle cx="18" cy="5" r="2" />
					<circle cx="12" cy="19" r="2" />
					<path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5" />
				</svg>
				Fork
			</button>
			<button
				type="button"
				onclick={() => (cloneOpen = !cloneOpen)}
				class="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-accent-400 px-4 text-sm font-semibold text-accent-900 shadow-[inset_0_0_0_1px_rgb(201_245_223/0.4),0_8px_28px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300 sm:flex-none"
				aria-expanded={cloneOpen}
				aria-haspopup="dialog"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
				</svg>
				Clone
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.6"
					stroke-linecap="round"
					class="transition-transform {cloneOpen ? '' : 'rotate-180'}"
					aria-hidden="true"
				>
					<path d="m6 15 6-6 6 6" />
				</svg>
			</button>
			{#if cloneOpen}
				<div
					role="dialog"
					aria-label="Clone {repo.name}"
					class="absolute top-[52px] right-0 z-20 flex w-full flex-col gap-3 rounded-[14px] bg-surface-3 p-4 shadow-[inset_0_0_0_1px_rgb(93_221_173/0.2),0_24px_60px_rgb(0_0_0/0.6)] sm:w-[440px]"
				>
					<div
						class="flex items-center gap-2 rounded-[10px] bg-bg px-3 py-2.5 ring-1 ring-line-strong ring-inset"
					>
						<code
							class="min-w-0 flex-1 truncate font-mono text-xs text-accent-200"
							title={cloneCommand}
						>
							git clone {shortUrl}
						</code>
						<button
							type="button"
							onclick={copyClone}
							class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] bg-accent-400/14 px-2.5 py-[5px] text-xs font-semibold text-accent-300 transition-colors hover:bg-accent-400/22"
						>
							{#if cloneCopied}
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="m5 12 5 5 9-10" />
								</svg>
								Copied
							{:else}
								Copy
							{/if}
						</button>
					</div>
					<span class="text-xs text-fg-3">
						Needs the gip command line tool, which you can install from
						<a href="/settings" class="text-accent-300 no-underline hover:text-accent-200">Settings</a>.
					</span>
				</div>
			{/if}
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
			href="/{repo.name}/commit/{c.oid}"
			class="mb-3 flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 no-underline transition-colors hover:border-neutral-700 hover:bg-neutral-800/60 sm:px-4"
			title="View commit"
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

	<nav aria-label="Repository" class="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
		<div class="inline-flex gap-0.5 rounded-xl bg-surface p-1 ring-1 ring-line ring-inset">
			{#each tabs as tab}
				{@const active = tab.match(page.url.pathname)}
				<a
					href={tab.href}
					aria-current={active ? 'page' : undefined}
					class="inline-flex h-[34px] shrink-0 items-center rounded-[9px] px-3.5 text-[13px] whitespace-nowrap no-underline transition-colors
						{active
						? 'bg-surface-4 font-semibold text-white shadow-[inset_0_0_0_1px_rgb(93_221_173/0.25),0_0_18px_rgb(35_204_148/0.15)]'
						: 'font-medium text-fg-2 hover:text-fg'}"
				>
					{tab.label}
					{#if tab.count !== undefined}
						<span class="ml-1 text-fg-3 tabular-nums">{tab.count}</span>
					{/if}
				</a>
			{/each}
		</div>
	</nav>

	{@render children()}
</main>
