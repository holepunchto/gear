<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { PageProps } from './$types';

	type Repo = {
		name: string;
		key: string;
		length: number;
		peers: number;
		writable: boolean;
		url: string;
	};
	type DiscoverRepo = {
		name: string;
		url: string;
		description?: string;
		inLibrary: boolean;
	};

	let { data, form }: PageProps = $props();

	let addPanelOpen = $state(false);
	let addTab = $state<'url' | 'new'>('url');
	let submittingAdd = $state(false);
	let submittingCreate = $state(false);

	let addingRepo = $state<string | null>(null);

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
	let discover: DiscoverRepo[] = $state<DiscoverRepo[]>([]);
	$effect(() => {
		data.discover.then((d: DiscoverRepo[]) => {
			discover = d.filter((r) => !r.inLibrary).map((r) => ({ ...r }));
		});
	});
	$effect(() => {
		repos = (data.repos as Repo[]).map((r) => ({ ...r }));
	});

	const seeding = $derived(repos.filter((r: Repo) => r.peers > 0).length);

	onMount(() => {
		const es = new EventSource('/api/events');
		es.addEventListener('repo', (e) => {
			try {
				const payload = JSON.parse((e as MessageEvent).data) as {
					name: string;
					length: number;
					peers: number;
				};
				const idx = repos.findIndex((r) => r.name === payload.name);
				if (idx !== -1) {
					const cur = repos[idx];
					const newUrl = cur.url.replace(/^(git\+pear:\/\/0\.)\d+(\..*)$/, `$1${payload.length}$2`);
					repos[idx] = { ...cur, length: payload.length, peers: payload.peers, url: newUrl };
				}
				const didx = discover.findIndex((r) => r.name === payload.name);
				if (didx !== -1 && !discover[didx].inLibrary) {
					discover[didx] = { ...discover[didx], inLibrary: true };
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
</script>

<svelte:head>
	<title>Repositories · Gear</title>
</svelte:head>

<main class="mx-auto max-w-[1100px] px-4 pt-6 pb-20 sm:px-6 sm:pt-8">

	<!-- ─── Toolbar ───────────────────────────────────────────────────────── -->
	<div class="mb-4 flex items-center justify-between gap-4">
		<div class="flex items-baseline gap-2.5">
			<h1 class="m-0 text-sm font-semibold text-white">Repositories</h1>
			{#if repos.length > 0}
				<span class="text-xs text-neutral-600">
					{repos.length}&thinsp;{repos.length === 1 ? 'repo' : 'repos'}
					<span class="mx-1">·</span>
					{seeding}&thinsp;seeding
				</span>
			{/if}
		</div>

		<button
			type="button"
			onclick={() => (addPanelOpen = !addPanelOpen)}
			class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors
				{addPanelOpen
					? 'border border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-white'
					: 'bg-accent-500 text-accent-900 hover:bg-accent-400'}"
		>
			{addPanelOpen ? '✕ Cancel' : '+ Add'}
		</button>
	</div>

	<!-- ─── Add panel ─────────────────────────────────────────────────────── -->
	{#if addPanelOpen}
		<div transition:slide={{ duration: 180 }} class="mb-5 overflow-hidden rounded-xl border border-neutral-800">

			<!-- Segmented control -->
			<div class="border-b border-neutral-800 p-2.5">
				<div class="flex rounded-lg bg-neutral-950 p-0.5">
					<button
						type="button"
						onclick={() => (addTab = 'url')}
						class="flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors
							{addTab === 'url'
								? 'bg-neutral-800 text-white'
								: 'text-neutral-500 hover:text-neutral-400'}"
					>
						Add from URL
					</button>
					<button
						type="button"
						onclick={() => (addTab = 'new')}
						class="flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors
							{addTab === 'new'
								? 'bg-neutral-800 text-white'
								: 'text-neutral-500 hover:text-neutral-400'}"
					>
						Create new
					</button>
				</div>
			</div>

			<!-- Form body -->
			<div class="bg-neutral-900 p-4">
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
							class="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-white placeholder:text-neutral-600 focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
						/>
						<button
							type="submit"
							disabled={submittingAdd}
							class="inline-flex shrink-0 items-center justify-center rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-400 disabled:opacity-60"
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
							class="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-white placeholder:text-neutral-600 focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
						/>
						<button
							type="submit"
							disabled={submittingCreate}
							class="inline-flex shrink-0 items-center justify-center rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-900 transition-colors hover:bg-accent-400 disabled:opacity-60"
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

	<!-- ─── Repo list ─────────────────────────────────────────────────────── -->
	{#if repos.length === 0}
		<div class="rounded-xl border border-neutral-800 bg-neutral-900/20 px-6 py-14 text-center">
			<p class="mb-1 font-mono text-2xl text-neutral-700">◈</p>
			<h3 class="m-0 text-sm font-semibold text-white">No repositories yet</h3>
			<p class="mt-1.5 text-xs text-neutral-500">
				Create one or paste a <span class="font-mono text-neutral-400">git+pear://</span> URL above.
			</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border border-neutral-800">
			<ul class="m-0 list-none p-0">
				{#each repos as repo (repo.name)}
					<li
						class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 bg-neutral-900 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-neutral-800/50 sm:flex-nowrap"
					>
						<div class="min-w-0 flex-1">
							{#if repo.writable}
								<div
									class="mb-0.5 text-[10px] font-semibold tracking-[0.12em] text-accent-400/70 uppercase"
									title="You are the owner of this repository"
								>
									Owner
								</div>
							{/if}
							<div class="flex items-center gap-2">
								<a href="/{repo.name}" class="font-mono text-[14px] font-semibold text-white no-underline hover:text-accent-400 transition-colors">
									{repo.name}
								</a>
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
								<span>
									<strong class="font-medium text-neutral-300">{repo.length.toLocaleString()}</strong>
									{' '}blocks
								</span>
								<span class="flex items-center gap-1.5">
									{#if repo.peers > 0}
										<span class="inline-block h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse-soft"></span>
									{/if}
									<strong class="font-medium text-neutral-300">{repo.peers}</strong>
									{' '}peer{repo.peers === 1 ? '' : 's'}
								</span>
								<span class="hidden min-w-0 truncate font-mono text-[11px] sm:inline" title={repo.url}>
									{shortUrl(repo.url)}
								</span>
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-1.5">
							<button
								type="button"
								onclick={() => copy(repo.url)}
								title="Copy URL"
								aria-label="Copy URL"
								class="rounded p-1.5 text-neutral-600 transition-colors hover:bg-neutral-700/60 hover:text-neutral-300"
							>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
									<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
								</svg>
							</button>
							<a
								href="/{repo.name}"
								class="inline-flex items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 no-underline transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
							>
								Open
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M5 12h14M12 5l7 7-7 7"/>
								</svg>
							</a>

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
										class="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-60"
										title="Click again to permanently delete"
									>
										{deleting === repo.name ? 'Deleting…' : 'Confirm'}
									</button>
									<button
										type="button"
										onclick={cancelDelete}
										class="rounded p-1.5 text-neutral-600 transition-colors hover:text-neutral-400"
									>
										✕
									</button>
								</form>
							{:else}
								<button
									type="button"
									onclick={() => armDelete(repo.name)}
									title="Delete repository"
									aria-label="Delete {repo.name}"
									class="rounded p-1.5 text-neutral-700 transition-colors hover:bg-red-500/10 hover:text-red-400"
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
										<path d="M3 6h18" />
										<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
										<path d="M10 11v6" />
										<path d="M14 11v6" />
									</svg>
								</button>
							{/if}
						</div>

						{#if deleteError && pendingDelete === repo.name}
							<p class="m-0 w-full text-xs text-red-400 sm:basis-full">{deleteError}</p>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- ─── Discover ──────────────────────────────────────────────────────── -->
	<section class="mt-12">
		<div class="mb-5 flex items-center gap-3">
			<span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Discover</span>
			<div class="h-px flex-1 bg-neutral-800"></div>
		</div>

		{#await data.discover}
			<div class="flex justify-center py-8">
				<span class="h-5 w-5 animate-spin rounded-full border-2 border-neutral-800 border-t-neutral-500"></span>
			</div>
		{:then _}
			{#if discover.length === 0}
				<p class="text-xs text-neutral-600">All available repositories are already in your library.</p>
			{:else}
				<div class="overflow-hidden rounded-xl border border-neutral-800">
					<ul class="m-0 list-none p-0">
						{#each discover as repo (repo.name)}
							<li
								class="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 bg-neutral-900 px-5 py-3.5 last:border-b-0 sm:flex-nowrap"
							>
								{#if addingRepo === repo.name}
									<div
										class="absolute inset-0 flex items-center justify-center bg-accent-900/80"
									>
										<span class="text-xs font-semibold text-accent-200">Adding…</span>
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<div class="font-mono text-[14px] font-semibold text-white">{repo.name}</div>
									{#if repo.description}
										<div class="mt-0.5 text-xs text-neutral-500">{repo.description}</div>
									{/if}
								</div>

								<div class="shrink-0">
									{#if repo.inLibrary}
										<span class="text-xs text-neutral-600">In library</span>
									{:else}
										<form
											method="POST"
											action="?/addFromSource"
											use:enhance={() => {
												addingRepo = repo.name;
												return async ({ update }) => {
													await update();
													addingRepo = null;
												};
											}}
										>
											<input type="hidden" name="name" value={repo.name} />
											<input type="hidden" name="url" value={repo.url} />
											<button
												type="submit"
												disabled={!!addingRepo}
												class="inline-flex cursor-pointer items-center rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
											>
												Add
											</button>
										</form>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/await}
	</section>
</main>
