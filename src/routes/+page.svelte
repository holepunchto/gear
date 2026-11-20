<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import PeerConstellation from '$lib/components/PeerConstellation.svelte';
	import SyncRing from '$lib/components/SyncRing.svelte';
	import Ticker from '$lib/components/Ticker.svelte';
	import YourReleases from '$lib/components/releases/YourReleases.svelte';
	import ReleaseLine from '$lib/components/releases/ReleaseLine.svelte';
	import { linkKey } from '$lib/releases';
	import type { PageProps } from './$types';

	type Repo = {
		name: string;
		key: string;
		length: number;
		contiguousLength: number;
		peers: number;
		writable: boolean;
		url: string;
		// Still being added: no record to delete yet.
		syncing: boolean;
	};
	let { data, form }: PageProps = $props();

	let addPanelOpen = $state(false);
	let addTab = $state<'url' | 'new'>('url');
	let submittingAdd = $state(false);
	let submittingCreate = $state(false);

	function openAdd(tab: 'url' | 'new') {
		addPanelOpen = !(addPanelOpen && addTab === tab);
		addTab = tab;
	}

	// Two-step delete: first click arms, second confirms. Auto-disarms after 4s.
	let pendingDelete = $state<string | null>(null);
	let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null;
	let deleting = $state<string | null>(null);
	let deleteError = $state<string | null>(null);

	function armDelete(name: string) {
		pendingDelete = name;
		deleteError = null;
		if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
		pendingDeleteTimer = setTimeout(() => {
			pendingDelete = null;
			pendingDeleteTimer = null;
		}, 4000);
	}

	function cancelDelete() {
		pendingDelete = null;
		if (pendingDeleteTimer) {
			clearTimeout(pendingDeleteTimer);
			pendingDeleteTimer = null;
		}
	}

	let repos: Repo[] = $state((data.repos as Repo[]).map((r) => ({ ...r })));

	$effect(() => {
		repos = (data.repos as Repo[]).map((r) => ({ ...r }));
	});

	const seeding = $derived(repos.filter((r: Repo) => r.peers > 0).length);
	const libraryNames = $derived(new Set(repos.map((r) => r.name)));

	// Network panel — seeded by the load, kept live by /api/events.
	let stats = $state(untrack(() => ({ ...data.stats })));
	$effect(() => {
		stats = { ...data.stats };
	});

	// Discover: a short taste here; the full list lives on /discover.
	const DISCOVER_PREVIEW = 8;
	let adding = $state<string | null>(null);
	let addError = $state<{ name: string; message: string } | null>(null);

	onMount(() => {
		const es = new EventSource('/api/events');
		es.addEventListener('stats', (e) => {
			try {
				const s = JSON.parse((e as MessageEvent).data);
				stats = { ...stats, ...s };
			} catch {
				// malformed payload — drop it
			}
		});
		es.addEventListener('release', () => invalidate('releases'));
		es.addEventListener('repo', (e) => {
			try {
				const payload = JSON.parse((e as MessageEvent).data) as {
					name: string;
					length: number;
					contiguousLength: number;
					peers: number;
				};
				const idx = repos.findIndex((r) => r.name === payload.name);
				if (idx !== -1) {
					const cur = repos[idx];
					const newUrl = cur.url.replace(/^(git\+pear:\/\/0\.)\d+(\..*)$/, `$1${payload.length}$2`);
					repos[idx] = {
						...cur,
						length: payload.length,
						contiguousLength: payload.contiguousLength,
						peers: payload.peers,
						url: newUrl
					};
				}
			} catch {
				// malformed payload — drop it
			}
		});
		return () => es.close();
	});

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {}
	}

	function shortUrl(url: string) {
		const match = url.match(/^(git\+pear:\/\/[^.]+\.[^.]+\.)([^/]+)(\/.+)$/);
		if (!match) return url;
		const [, head, key, tail] = match;
		return head + key.slice(0, 6) + '…' + tail;
	}

	function syncLabel(r: Repo) {
		if (r.length === 0) return r.writable ? 'empty' : 'waiting for peers';
		if (r.contiguousLength >= r.length) return 'in sync';
		return `syncing ${Math.floor((r.contiguousLength / r.length) * 100)}%`;
	}
</script>

<svelte:head>
	<title>Library · Gear</title>
</svelte:head>

<main class="mx-auto flex max-w-[1280px] flex-col gap-10 px-4 pt-6 pb-20 sm:px-8 sm:pt-10">
	<!-- ─── Hero ──────────────────────────────────────────────────────────── -->
	<section class="flex flex-wrap items-stretch gap-6">
		<div class="flex min-w-0 flex-[1_1_520px] flex-col justify-center gap-3.5">
			<h1
				class="m-0 font-display text-[40px] leading-[1.02] font-semibold tracking-[-0.035em] text-fg sm:text-[52px]"
			>
				Your library
			</h1>
			<p class="m-0 max-w-[520px] text-base leading-normal text-fg-2">
				{#if repos.length > 0}
					{repos.length}
					{repos.length === 1 ? 'repository' : 'repositories'} on this device. Share a link and peers
					clone straight from you.
				{:else}
					Nothing here yet. Create a repository, or add one by its link.
				{/if}
			</p>
			<div class="flex flex-wrap gap-2.5 pt-2">
				<button
					type="button"
					onclick={() => openAdd('new')}
					aria-expanded={addPanelOpen && addTab === 'new'}
					class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] bg-accent-400 px-4 text-sm font-semibold text-accent-900 shadow-[0_8px_28px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
					New repository
				</button>
				<button
					type="button"
					onclick={() => openAdd('url')}
					aria-expanded={addPanelOpen && addTab === 'url'}
					class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] bg-surface-3 px-3.5 text-sm font-medium text-fg ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-4"
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
						<path
							d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
						/>
					</svg>
					Add by link
				</button>
			</div>
		</div>

		<section
			aria-label="Network"
			class="flex min-w-0 flex-[1_1_440px] flex-wrap items-center justify-center gap-[22px] rounded-[20px] bg-linear-160 from-[#10201a] to-[#0a110d] to-70% px-5 py-[22px] shadow-[inset_0_0_0_1px_rgb(93_221_173/0.14),0_24px_70px_rgb(0_0_0/0.4)] sm:px-6"
		>
			<PeerConstellation
				peers={stats.swarmPeers}
				blind={stats.blindPeers}
				width={176}
				height={176}
				rings
				label="You, {stats.swarmPeers} peer{stats.swarmPeers === 1
					? ''
					: 's'} and {stats.blindPeers} blind peer{stats.blindPeers === 1 ? '' : 's'}"
			/>
			<div class="grid min-w-[180px] flex-1 grid-cols-2 gap-x-5 gap-y-4">
				<div>
					<div class="font-display text-[30px] font-semibold tracking-[-0.02em] text-fg">
						<Ticker value={stats.peers} />
					</div>
					<div class="text-xs text-fg-2">peers connected</div>
				</div>
				<div>
					<div class="font-display text-[30px] font-semibold tracking-[-0.02em] text-fg">
						<Ticker value={stats.blindPeers} /><span class="text-lg text-fg-3"
							>/{data.blindPeersConfigured}</span
						>
					</div>
					<div class="text-xs text-fg-2">blind peers online</div>
				</div>
				<div>
					<div class="font-display text-lg font-semibold text-accent-200">
						<Ticker value={seeding} />
						<span class="text-fg-3">/ {repos.length}</span>
					</div>
					<div class="text-xs text-fg-2">repos with peers</div>
				</div>
				<div>
					<div class="font-display text-lg font-semibold text-fg-2">
						<Ticker value={stats.dhtNodes} />
					</div>
					<div class="text-xs text-fg-2">DHT nodes</div>
				</div>
			</div>
		</section>
	</section>

	<!-- ─── Add panel ─────────────────────────────────────────────────────── -->
	{#if addPanelOpen}
		<div
			transition:slide={{ duration: 180 }}
			class="-mt-4 overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset"
		>
			<div class="flex border-b border-line px-3">
				<button
					type="button"
					onclick={() => (addTab = 'url')}
					class="cursor-pointer border-b-2 px-3 py-2.5 text-xs font-medium transition-colors
						{addTab === 'url' ? 'border-accent-400 text-fg' : 'border-transparent text-fg-3 hover:text-fg-2'}"
				>
					Add by link
				</button>
				<button
					type="button"
					onclick={() => (addTab = 'new')}
					class="cursor-pointer border-b-2 px-3 py-2.5 text-xs font-medium transition-colors
						{addTab === 'new' ? 'border-accent-400 text-fg' : 'border-transparent text-fg-3 hover:text-fg-2'}"
				>
					New repository
				</button>
				<span class="flex-1"></span>
				<button
					type="button"
					onclick={() => (addPanelOpen = false)}
					aria-label="Close"
					class="cursor-pointer px-2 text-fg-3 hover:text-fg"
				>
					✕
				</button>
			</div>

			<div class="p-4">
				{#if addTab === 'url'}
					<form
						method="POST"
						action="?/add"
						use:enhance={() => {
							submittingAdd = true;
							return async ({ update, result }) => {
								await update();
								submittingAdd = false;
								if (result.type !== 'failure' && result.type !== 'error') addPanelOpen = false;
							};
						}}
						class="flex flex-col gap-2 sm:flex-row"
					>
						<input
							type="text"
							name="url"
							placeholder="git+pear://0.247.abc123…/repo-name"
							autocomplete="off"
							required
							class="min-w-0 flex-1 rounded-[10px] border-0 bg-bg px-3 py-2.5 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
						/>
						<button
							type="submit"
							disabled={submittingAdd}
							class="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-accent-400 px-4 py-2.5 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-300 disabled:opacity-60"
						>
							{submittingAdd ? 'Syncing…' : 'Sync'}
						</button>
						{#if form?.add?.error}
							<p class="m-0 w-full text-xs text-red-400">{form.add.error}</p>
						{/if}
					</form>
				{:else}
					<form
						method="POST"
						action="?/create"
						use:enhance={() => {
							submittingCreate = true;
							return async ({ update, result }) => {
								await update();
								submittingCreate = false;
								if (result.type !== 'failure' && result.type !== 'error') addPanelOpen = false;
							};
						}}
						class="flex flex-col gap-2 sm:flex-row"
					>
						<input
							type="text"
							name="name"
							placeholder="my-new-repo"
							autocomplete="off"
							required
							pattern="[a-zA-Z0-9_\-]+"
							class="min-w-0 flex-1 rounded-[10px] border-0 bg-bg px-3 py-2.5 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
						/>
						<button
							type="submit"
							disabled={submittingCreate}
							class="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-accent-400 px-4 py-2.5 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-300 disabled:opacity-60"
						>
							{submittingCreate ? 'Creating…' : 'Create'}
						</button>
						{#if form?.create?.error}
							<p class="m-0 w-full text-xs text-red-400">{form.create.error}</p>
						{/if}
					</form>
				{/if}
			</div>
		</div>
	{/if}

	{#if data.releases.length}
		<YourReleases keys={data.releases} />
	{/if}

	<!-- ─── On this device ────────────────────────────────────────────────── -->
	<section aria-label="Repositories" class="flex flex-col gap-4">
		<h2 class="m-0 text-xl font-semibold tracking-[-0.01em] text-fg">On this device</h2>

		{#if repos.length === 0}
			<div class="rounded-2xl bg-surface px-6 py-14 text-center ring-1 ring-line ring-inset">
				<h3 class="m-0 text-base font-semibold text-fg">No repositories yet</h3>
				<p class="mt-1.5 text-sm text-fg-2">
					Create one, add one by its <span class="font-mono text-fg">git+pear://</span> link, or pick
					one from Discover below.
				</p>
			</div>
		{:else}
			<ul
				class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] gap-4 p-0"
			>
				{#each repos as repo (repo.name)}
					<li
						class="relative flex flex-col gap-3.5 rounded-2xl bg-surface p-[18px] ring-1 ring-line transition-colors ring-inset hover:bg-surface-2"
					>
						<div class="flex items-start gap-3.5">
							<SyncRing
								length={repo.length}
								contiguous={repo.contiguousLength}
								peers={repo.peers}
							/>
							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<div class="flex min-w-0 items-center gap-2">
									<!-- Stretched link — before: overlay makes the whole card navigate;
										the other controls sit above it via relative z-10. -->
									<a
										href="/{repo.name}"
										class="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-fg no-underline before:absolute before:inset-0 before:rounded-2xl"
									>
										{repo.name}
									</a>
									{#if repo.writable}
										<span
											class="shrink-0 rounded-full bg-accent-400/12 px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] text-accent-300 uppercase"
											title="You are the owner of this repository"
										>
											Owner
										</span>
									{/if}
								</div>
								<span class="truncate font-mono text-xs text-fg-3" title={repo.url}>
									{shortUrl(repo.url)}
								</span>
								{#if data.badges[repo.key]}
									<ReleaseLine release={data.badges[repo.key]} />
								{/if}
							</div>

							<div class="relative z-10 -mt-1 -mr-1.5 flex shrink-0 items-center gap-0.5">
								{#if pendingDelete === repo.name}
									<form
										method="POST"
										action="?/delete"
										use:enhance={() => {
											deleting = repo.name;
											return async ({ result, update }) => {
												if (result.type === 'success') {
													repos = repos.filter((r) => r.name !== repo.name);
													pendingDelete = null;
													if (pendingDeleteTimer) {
														clearTimeout(pendingDeleteTimer);
														pendingDeleteTimer = null;
													}
													// Re-run loads so layout data (the search overlay's
													// library list) drops the deleted repo too.
													await invalidateAll();
												} else if (result.type === 'failure') {
													const f = result.data?.delete as { error?: string } | undefined;
													deleteError = f?.error ?? 'Delete failed';
												} else if (result.type === 'error') {
													deleteError = result.error?.message ?? 'Delete failed';
												} else {
													await update();
												}
												deleting = null;
											};
										}}
										class="contents"
									>
										<input type="hidden" name="name" value={repo.name} />
										<button
											type="submit"
											disabled={deleting === repo.name}
											class="inline-flex cursor-pointer items-center rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-500/40 transition-colors ring-inset hover:bg-red-500/20 disabled:opacity-60"
											title="Click again to permanently delete"
										>
											{deleting === repo.name ? 'Deleting…' : 'Confirm'}
										</button>
										<button
											type="button"
											onclick={cancelDelete}
											aria-label="Cancel delete"
											class="tap-44 cursor-pointer rounded-lg p-1.5 text-fg-3 transition-colors hover:text-fg"
										>
											✕
										</button>
									</form>
								{:else}
									<button
										type="button"
										onclick={() => copy(repo.url)}
										title="Copy link"
										aria-label="Copy link to {repo.name}"
										class="tap-44 cursor-pointer rounded-lg p-1.5 text-fg-3 transition-colors hover:bg-surface-4 hover:text-fg"
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
											<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
										</svg>
									</button>
									<button
										type="button"
										onclick={() => armDelete(repo.name)}
										hidden={repo.syncing}
										title="Delete repository"
										aria-label="Delete {repo.name}"
										class="tap-44 cursor-pointer rounded-lg p-1.5 text-fg-3 transition-colors hover:bg-red-500/10 hover:text-red-400"
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<path d="M3 6h18" />
											<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
											<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
											<path d="M10 11v6" />
											<path d="M14 11v6" />
										</svg>
									</button>
								{/if}
							</div>
						</div>

						<div class="flex gap-4 text-xs text-fg-3 tabular-nums">
							<span class={repo.contiguousLength < repo.length ? 'text-apricot-300' : ''}>
								{syncLabel(repo)}
							</span>
							<span>{repo.peers} peer{repo.peers === 1 ? '' : 's'}</span>
							<span class="ml-auto">{repo.length.toLocaleString()} blocks</span>
						</div>

						{#if deleteError && pendingDelete === repo.name}
							<p class="m-0 text-xs text-red-400">{deleteError}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- ─── Discover ──────────────────────────────────────────────────────── -->
	<section id="discover" aria-label="Discover" class="flex scroll-mt-24 flex-col gap-4">
		<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
			<h2 class="m-0 text-xl font-semibold tracking-[-0.01em] text-fg">Discover</h2>
			<span class="text-[13px] text-fg-3">Manifest updated over the air · works offline</span>
		</div>

		{#await data.discover}
			<ul
				aria-label="Loading the manifest"
				class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3 p-0"
			>
				{#each { length: 8 }, i (i)}
					<li
						class="flex items-center gap-3 rounded-xl bg-[#0a110d] px-3.5 py-3 ring-1 ring-line ring-inset"
					>
						<span class="h-8 w-8 shrink-0 animate-pulse-soft rounded-[9px] bg-surface-3"></span>
						<span class="flex flex-1 flex-col gap-2">
							<span class="h-3 w-24 animate-pulse-soft rounded bg-surface-3"></span>
							<span class="h-2.5 w-14 animate-pulse-soft rounded bg-surface-3"></span>
						</span>
					</li>
				{/each}
			</ul>
		{:then all}
			{@const list = all.filter((d) => !libraryNames.has(d.name))}
			{#if list.length === 0}
				<p class="m-0 text-sm text-fg-3">Everything in the manifest is already in your library.</p>
			{:else}
				<ul
					class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3 p-0"
				>
					{#each list.slice(0, DISCOVER_PREVIEW) as d (d.name)}
						{@const release = data.badges[linkKey(d.url) ?? '']}
						<li
							class="flex flex-col gap-1.5 rounded-xl bg-[#0a110d] px-3.5 py-3 ring-1 ring-line ring-inset"
							title={d.description ?? undefined}
						>
							<div class="flex items-center gap-3">
								<span
									aria-hidden="true"
									class="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface-3 font-mono text-[13px] font-semibold text-accent-300"
								>
									{d.name.slice(0, 2)}
								</span>
								<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
									<span class="truncate font-medium text-fg">{d.name}</span>
									{#if release}
										<ReleaseLine {release} />
									{/if}
								</span>
								<form
									method="POST"
									action="?/addFromSource"
									use:enhance={() => {
										adding = d.name;
										addError = null;
										return async ({ result, update }) => {
											if (result.type === 'failure') {
												const f = result.data?.addFromSource as { error?: string } | undefined;
												addError = { name: d.name, message: f?.error ?? 'Failed to add' };
											} else if (result.type === 'error') {
												addError = {
													name: d.name,
													message: result.error?.message ?? 'Failed to add'
												};
											} else {
												await update();
											}
											adding = null;
										};
									}}
								>
									<input type="hidden" name="name" value={d.name} />
									<input type="hidden" name="url" value={d.url} />
									<button
										type="submit"
										disabled={!!adding}
										aria-label="Add {d.name}"
										class="tap-44 grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-lg bg-accent-400/10 text-accent-300 transition-colors hover:bg-accent-400/20 disabled:cursor-not-allowed disabled:opacity-40"
									>
										{#if adding === d.name}
											<span
												class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-400/30 border-t-accent-300"
											></span>
										{:else}
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2.6"
												stroke-linecap="round"
												aria-hidden="true"
											>
												<path d="M12 5v14M5 12h14" />
											</svg>
										{/if}
									</button>
								</form>
							</div>
							{#if addError?.name === d.name}
								<p class="m-0 text-xs text-red-400">{addError.message}</p>
							{/if}
						</li>
					{/each}
				</ul>
				{#if list.length > DISCOVER_PREVIEW}
					<a
						href="/discover"
						class="self-start rounded-lg px-3 py-1.5 text-[13px] font-medium text-accent-300 no-underline transition-colors hover:bg-surface-3"
					>
						Show more
					</a>
				{/if}
			{/if}
		{/await}
	</section>
</main>
