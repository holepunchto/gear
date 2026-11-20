<script lang="ts">
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import ReplicationPanel from '$lib/components/ReplicationPanel.svelte';
	import LiveActivity, { type Activity } from '$lib/components/LiveActivity.svelte';
	import Ticker from '$lib/components/Ticker.svelte';
	import SeatDots from '$lib/components/releases/SeatDots.svelte';
	import ReleaseCard from '$lib/components/releases/ReleaseCard.svelte';
	import ReleaseInstall from '$lib/components/releases/ReleaseInstall.svelte';
	import CopyButton from '$lib/components/releases/CopyButton.svelte';
	import { liveReleases, multisig } from '$lib/releases';

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
	let liveContiguous = $state(untrack(() => data.repo.contiguousLength));
	let liveHeld = $state(untrack(() => data.repo.held));
	let liveBuckets = $state.raw(untrack(() => data.repo.buckets));
	let pushFlash = $state(false);

	$effect(() => {
		// Re-seed when SvelteKit revalidates the layout load.
		liveLength = data.repo.length;
		livePeers = data.repo.peers;
		liveContiguous = data.repo.contiguousLength;
		liveHeld = data.repo.held;
		liveBuckets = data.repo.buckets;
	});

	// What happened while this page was open: appends and peer changes from
	// the SSE stream. Client memory only, newest first, capped.
	const ACTIVITY_CAP = 20;
	let activity = $state.raw<Activity[]>([]);
	let activityId = 0;
	let lastAppend = $state.raw<{ added: number; at: number } | null>(null);
	let freshBlocks = $state.raw<{ from: number; to: number }[]>([]);
	let now = $state(Date.now());

	function record(text: string) {
		activity = [{ id: ++activityId, text, at: Date.now() }, ...activity].slice(0, ACTIVITY_CAP);
	}

	// The Clone button, the Releases tab and the release card follow every
	// release key, on every tab.
	onMount(liveReleases);

	onMount(() => {
		const name = untrack(() => data.repo.name);
		const es = new EventSource(`/api/events/${encodeURIComponent(name)}`);
		// While a repo is being added, arrival is logged from the held count
		// every 500 blocks or so, not from appends.
		let loggedHeld = untrack(() => data.repo.held);

		es.addEventListener('repo', (e) => {
			try {
				const s = JSON.parse((e as MessageEvent).data);
				if (typeof s.length === 'number') liveLength = s.length;
				if (typeof s.contiguousLength === 'number') liveContiguous = s.contiguousLength;
				if (typeof s.held === 'number') liveHeld = s.held;
				if (s.buckets !== undefined) liveBuckets = s.buckets;
				if (data.repo.syncing && typeof s.held === 'number') {
					const n = s.held - loggedHeld;
					if (n >= 500 || (n > 0 && s.held === s.length)) {
						loggedHeld = s.held;
						lastAppend = { added: n, at: Date.now() };
						record(
							`+${n} blocks · ${s.held.toLocaleString()} of ${s.length.toLocaleString()} held`
						);
					}
				}
				if (typeof s.peers === 'number' && s.peers !== livePeers) {
					const n = s.peers - livePeers;
					if (n > 0) record(`${n === 1 ? 'A peer' : `${n} peers`} joined · ${s.peers} now`);
					else record(`${n === -1 ? 'A peer' : `${-n} peers`} left · ${s.peers} now`);
					livePeers = s.peers;
				}
			} catch {
				// drop malformed payload
			}
		});

		es.addEventListener('append', (e) => {
			// Blocks landed — someone pushed (or we did). Flash the counter
			// and ask SvelteKit to re-run the load so refs/HEAD refresh too.
			try {
				const d = JSON.parse((e as MessageEvent).data) as {
					from: number;
					to: number;
					added: number;
				};
				// Mid-add, an append only reveals how long the remote core is;
				// no block has arrived yet.
				if (data.repo.syncing) {
					const on = livePeers > 0 ? ` on ${livePeers} peer${livePeers === 1 ? '' : 's'}` : '';
					record(`Found ${d.to.toLocaleString()} blocks${on}`);
					invalidate('repo:' + name).catch(() => {});
					return;
				}
				const range = { from: d.from, to: d.to };
				lastAppend = { added: d.added, at: Date.now() };
				record(`+${d.added} block${d.added === 1 ? '' : 's'}`);
				freshBlocks = [...freshBlocks, range];
				setTimeout(() => (freshBlocks = freshBlocks.filter((r) => r !== range)), 1600);
			} catch {
				// drop malformed payload
			}
			pushFlash = true;
			setTimeout(() => (pushFlash = false), 1500);
			invalidate('repo:' + name).catch(() => {});
		});

		// A repo still being added swaps to the real view once it lands, or to
		// the error when the add fails.
		es.addEventListener('ready', () => {
			if (data.repo.syncing) invalidateAll();
		});
		es.addEventListener('failed', () => {
			if (data.repo.syncing && !data.repo.error) invalidateAll();
		});

		const clock = setInterval(() => (now = Date.now()), 1000);

		return () => {
			es.close();
			clearInterval(clock);
		};
	});

	// Active ref, resolved by the layout load (path param, ?ref=, or HEAD).
	const currentRef = $derived(repo.ref?.name ?? repo.head ?? 'main');
	// Query string that keeps commit links scoped when off the head branch.
	const refQuery = $derived(
		repo.ref && !repo.ref.isHead ? `?ref=${encodeURIComponent(repo.ref.name)}` : ''
	);

	let cloneOpen = $state(false);
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

	// The Releases tab and a release's page under it.
	function inReleases(p: string) {
		return p === `/${repo.name}/releases` || p.startsWith(`/${repo.name}/releases/`);
	}

	const tabs = $derived([
		{
			label: 'Files',
			href: `/${repo.name}/${currentRef}/`,
			match: (p: string) =>
				!p.endsWith('/branches') &&
				!p.endsWith('/tags') &&
				!p.endsWith('/commits') &&
				!inReleases(p) &&
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
		},
		{
			label: 'Releases',
			href: `/${repo.name}/releases`,
			release: repo.release,
			match: inReleases
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
		<a href="/" class="tap-44 text-neutral-500 no-underline hover:text-accent-400"> Library </a>
		<span class="text-neutral-700">/</span>
		{#if page.params.oid}
			<a href="/{repo.name}" class="tap-44 text-neutral-500 no-underline hover:text-accent-400">
				{repo.name}
			</a>
			<span class="text-neutral-700">/</span>
			<span class="font-mono font-medium text-white">{page.params.oid.slice(0, 10)}</span>
		{:else if repo.ref && !repo.ref.isHead}
			<a href="/{repo.name}" class="tap-44 text-neutral-500 no-underline hover:text-accent-400">
				{repo.name}
			</a>
			<span class="text-neutral-700">/</span>
			<span class="font-mono font-medium text-white">
				{repo.ref.kind === 'commit' ? repo.refCommit.oid.slice(0, 7) : repo.ref.name}
			</span>
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
						<Ticker value={liveLength} />
					</b>
					block{liveLength === 1 ? '' : 's'}
				</span>
				<span class="inline-flex items-center gap-1.5">
					<span
						class="h-1.5 w-1.5 rounded-full {livePeers > 0
							? 'animate-pulse-soft bg-accent-400 shadow-glow-strong'
							: 'bg-neutral-600'}"
					></span>
					<b class="font-semibold text-fg tabular-nums"><Ticker value={livePeers} /></b>
					peer{livePeers === 1 ? '' : 's'}
				</span>
				{#if repo.commitCount && repo.commitCount.count > 0}
					<a href="/{repo.name}/commits{refQuery}" class="tap-44 text-fg-2 no-underline hover:text-accent-300">
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
				hidden={repo.syncing}
				onclick={() => {
					showForkForm = !showForkForm;
					if (showForkForm && !forkName) forkName = `${repo.name}-fork`;
				}}
				class="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-surface-3 sm:h-10 px-3.5 text-sm font-medium text-fg ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-4 sm:flex-none"
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
				hidden={!!repo.error}
				onclick={() => (cloneOpen = !cloneOpen)}
				class="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors sm:h-10 sm:flex-none {repo.release?.tag
					? multisig(repo.release.signers)
						? 'bg-surface-3 text-seal-100 shadow-[inset_0_0_0_1px_rgb(167_139_250/0.9),0_8px_28px_rgb(139_92_246/0.35)] hover:bg-surface-4'
						: 'bg-surface-3 text-seal-100 shadow-[inset_0_0_0_1px_rgb(167_139_250/0.7)] hover:bg-surface-4'
					: 'bg-accent-400 text-accent-900 shadow-[inset_0_0_0_1px_rgb(201_245_223/0.4),0_8px_28px_rgb(35_204_148/0.35)] hover:bg-accent-300'}"
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
				{#if repo.release?.tag}
					<span
						class="rounded-md bg-seal-400/20 px-1.5 py-px font-mono text-xs text-seal-100"
					>
						{repo.release.tag}
					</span>
				{/if}
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
					{#if repo.release?.tag && repo.release.source}
						<ReleaseInstall name={repo.name} release={repo.release} pear={repo.pearApp} />
						<span class="border-t border-white/6 pt-3 text-[13px] font-semibold text-fg">Current head</span>
					{/if}
					<div
						class="flex items-center gap-2 rounded-[10px] bg-bg px-3 py-2.5 ring-1 ring-line-strong ring-inset"
					>
						<code
							class="min-w-0 flex-1 truncate font-mono text-xs text-accent-200"
							title={cloneCommand}
						>
							git clone {shortUrl}
						</code>
						<CopyButton value={cloneCommand} title="Copy the git clone command" />
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

	{#if !repo.error}
		<ReplicationPanel
			length={liveLength}
			contiguous={liveContiguous}
			held={liveHeld}
			buckets={liveBuckets}
			peers={livePeers}
			writable={repo.writable}
			fresh={freshBlocks}
			last={lastAppend}
			{now}
		/>
	{/if}

	<nav
		aria-label="Repository"
		hidden={repo.syncing}
		class="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0"
	>
		<div class="inline-flex gap-0.5 rounded-xl bg-surface p-1 ring-1 ring-line ring-inset">
			{#each tabs as tab}
				{@const active = tab.match(page.url.pathname)}
				<a
					href={tab.href}
					aria-current={active ? 'page' : undefined}
					class="inline-flex h-11 shrink-0 items-center rounded-[9px] px-3.5 sm:h-[34px] text-[13px] whitespace-nowrap no-underline transition-colors
						{active
						? 'bg-surface-4 font-semibold text-white shadow-[inset_0_0_0_1px_rgb(93_221_173/0.25),0_0_18px_rgb(35_204_148/0.15)]'
						: 'font-medium text-fg-2 hover:text-fg'}"
				>
					{tab.label}
					{#if tab.count !== undefined}
						<span class="ml-1 text-fg-3 tabular-nums">{tab.count}</span>
					{/if}
					{#if tab.release}
						{#if tab.release.version}
							<span class="ml-1.5 font-mono text-xs text-seal-200">{tab.release.version}</span>
						{/if}
						<span class="ml-1.5 inline-flex">
							<SeatDots
								n={tab.release.signers}
								filled={tab.release.quorum}
								seal={!!tab.release.version}
							/>
						</span>
						{#if tab.release.pending}
							<span
								class="ml-1.5 h-[7px] w-[7px] rounded-full bg-apricot-400 shadow-[0_0_8px_#fb923c]"
								title="Release in progress"
							></span>
						{/if}
					{/if}
				</a>
			{/each}
		</div>
	</nav>

	<div class="flex flex-wrap items-start gap-6">
		<div class="min-w-0 flex-[999_1_640px]">
			{#if repo.error}
				<div class="rounded-2xl bg-surface px-6 py-16 text-center ring-1 ring-line ring-inset">
					<h3 class="m-0 text-lg font-semibold text-fg">Couldn't add {repo.name}</h3>
					<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-red-400">{repo.error}</p>
					<form
						method="POST"
						action="/{repo.name}?/dismiss"
						class="mt-5 flex justify-center gap-2.5"
					>
						<a
							href="/"
							class="inline-flex h-10 items-center rounded-[10px] px-3.5 text-sm font-medium text-fg-2 no-underline ring-1 ring-line-strong ring-inset hover:text-fg"
						>
							Back to Library
						</a>
						<button
							type="submit"
							class="inline-flex h-10 cursor-pointer items-center rounded-[10px] bg-surface-3 px-3.5 text-sm font-medium text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-4"
						>
							Dismiss
						</button>
					</form>
				</div>
			{:else if repo.syncing}
				<div class="rounded-2xl bg-surface px-6 py-16 text-center ring-1 ring-line ring-inset">
					<h3 class="m-0 text-lg font-semibold text-fg">Adding {repo.name}</h3>
					<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
						Blocks are arriving from peers. Files and commits show up here once every block is held.
					</p>
				</div>
			{:else}
				{@render children()}
			{/if}
		</div>
		<aside class="hidden min-w-0 flex-[1_1_300px] flex-col gap-4 lg:flex">
			<LiveActivity items={activity} {now} />
			{#if repo.release}
				<ReleaseCard release={repo.release} repo={repo.name} />
			{/if}
		</aside>
	</div>
</main>
