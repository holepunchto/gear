<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
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

	let showNewForm = $state(false);
	let submittingAdd = $state(false);
	let submittingCreate = $state(false);

	let addingRepo = $state<string | null>(null);

	// Two-step delete to avoid an extra modal: first click arms the row, the
	// second confirms. Auto-disarms after 4s so a forgotten arm doesn't sit
	// there waiting to nuke a repo by accident.
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

	// Mirror the loader's repo list as reactive state so per-repo SSE updates
	// can patch individual rows in place. We keep the original derived data
	// for first paint and re-sync if the loader runs again.
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
		// Single SSE connection for the whole page — global 'stats' is handled
		// by the layout, here we just listen for 'repo' updates and patch the
		// matching row. New blocks land in the list with no polling.
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
					// Recompute the URL — its block component encodes the length.
					const newUrl = cur.url.replace(/^(git\+pear:\/\/0\.)\d+(\..*)$/, `$1${payload.length}$2`);
					repos[idx] = { ...cur, length: payload.length, peers: payload.peers, url: newUrl };
				}
				// Mark as in-library in the discover list if it just appeared
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
	<div class="flex-rowitems-end mb-6 flex items-center justify-between gap-3 sm:gap-4">
		<h1 class="m-0 text-xl font-semibold tracking-tight text-white sm:text-[22px]">
			Your repositories
		</h1>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => (showNewForm = !showNewForm)}
				class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:border-neutral-600 hover:bg-neutral-800"
			>
				+ New repository
			</button>
		</div>
	</div>

	{#if showNewForm}
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				submittingCreate = true;
				return async ({ update }) => {
					await update();
					submittingCreate = false;
				};
			}}
			class="mb-5 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-4 sm:grid-cols-[1fr_auto]"
		>
			<input
				type="text"
				name="name"
				placeholder="my-new-repo"
				autocomplete="off"
				required
				pattern="[a-zA-Z0-9_\-]+"
				class="min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={submittingCreate}
				class="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-accent-900 shadow-sm transition-colors hover:bg-accent-400 disabled:opacity-60"
			>
				{submittingCreate ? 'Creating…' : 'Create'}
			</button>
			{#if form?.create?.error}
				<p class="m-0 text-sm text-red-400 sm:col-span-2">{form.create.error}</p>
			{/if}
		</form>
	{/if}

	<form
		method="POST"
		action="?/add"
		use:enhance={() => {
			submittingAdd = true;
			return async ({ update }) => {
				await update();
				submittingAdd = false;
			};
		}}
		class="mb-5 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-4 sm:grid-cols-[1fr_auto]"
	>
		<input
			type="text"
			name="url"
			placeholder="git+pear://0.247.abc123…xyz/repo-name"
			autocomplete="off"
			required
			class="min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
		/>
		<button
			type="submit"
			disabled={submittingAdd}
			class="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-accent-900 shadow-sm transition-colors hover:bg-accent-400 disabled:opacity-60"
		>
			{submittingAdd ? 'Syncing…' : 'Add from URL'}
		</button>
		{#if form?.add?.error}
			<p class="m-0 text-sm text-red-400 sm:col-span-2">{form.add.error}</p>
		{/if}
	</form>

	{#if repos.length === 0}
		<div class="rounded-lg border border-neutral-800 bg-neutral-900 px-6 py-12 text-center">
			<h3 class="m-0 text-base font-semibold text-white">No repositories yet</h3>
			<p class="mt-1.5 text-sm text-neutral-400">
				Create a new one or add an existing <span class="font-mono">git+pear://</span> URL above.
			</p>
		</div>
	{:else}
		<div class="min-w-0 pb-4">
			<p class="mt-1 text-sm text-neutral-400">
				{repos.length} repositor{repos.length === 1 ? 'y' : 'ies'}
				· {seeding} seeding
			</p>
		</div>
		<div class="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
			<ul class="m-0 list-none p-0">
				{#each repos as repo (repo.name)}
					<li
						class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 p-4 px-5 transition-colors last:border-b-0 hover:bg-neutral-800/40 sm:flex-nowrap"
					>
						<div class="min-w-0 flex-1">
							{#if repo.writable}
								<!-- Kicker sits above the name in a fixed position so it
									reads the same way on every row, regardless of how
									long the repo name is. -->
								<div
									class="mb-0.5 text-[10px] font-semibold tracking-[0.14em] text-accent-300 uppercase"
									title="You are the writer of this repo"
								>
									Owner
								</div>
							{/if}
							<div class="flex items-center gap-2.5 text-[15px] font-semibold">
								<a href="/{repo.name}" class="text-white no-underline hover:text-accent-400">
									{repo.name}
								</a>
							</div>
							<div
								class="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-neutral-500"
							>
								<span>
									<strong class="font-semibold text-neutral-200"
										>{repo.length.toLocaleString()}</strong
									>
									block{repo.length === 1 ? '' : 's'}
								</span>
								<span>
									<strong class="font-semibold text-neutral-200">{repo.peers}</strong>
									peer{repo.peers === 1 ? '' : 's'}
								</span>
								<span class="hidden min-w-0 truncate font-mono sm:inline" title={repo.url}>
									{shortUrl(repo.url)}
								</span>
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<button
								type="button"
								onclick={() => copy(repo.url)}
								title="Copy URL"
								aria-label="Copy URL"
								class="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
							>
								⧉
							</button>
							<a
								href="/{repo.name}"
								class="inline-flex items-center rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white no-underline hover:bg-neutral-700"
							>
								Open
							</a>
							{#if pendingDelete === repo.name}
								<form
									method="POST"
									action="?/delete"
									use:enhance={() => {
										deleting = repo.name;
										return async ({ result, update }) => {
											if (result.type === 'success') {
												// Drop locally so the row disappears
												// without waiting for a full reload.
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
										class="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-60"
										title="Click again to permanently delete"
									>
										{deleting === repo.name ? 'Deleting…' : 'Confirm delete'}
									</button>
									<button
										type="button"
										onclick={cancelDelete}
										class="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
									>
										Cancel
									</button>
								</form>
							{:else}
								<button
									type="button"
									onclick={() => armDelete(repo.name)}
									title="Delete repository"
									aria-label="Delete {repo.name}"
									class="rounded-md px-2 py-1 text-neutral-500 hover:bg-red-500/15 hover:text-red-300"
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
						{#if deleteError && pendingDelete === repo.name}
							<p class="m-0 w-full text-xs text-red-400 sm:basis-full">{deleteError}</p>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<section class="mt-10">
		<h2 class="mb-4 text-base font-semibold text-white">Discover</h2>
		{#await data.discover}
			<div class="text-center">
				<span
					class="inline-block h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-apricot-500 text-xs"
				>
				</span>
			</div>
		{:then _}
			{#if discover.length === 0}
				<p class="text-center text-xs text-neutral-500">You've added all available repositories.</p>
			{:else}
				<div class="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
					<ul class="m-0 list-none p-0">
						{#each discover as repo (repo.name)}
							<li
								class="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 p-4 px-5 last:border-b-0 sm:flex-nowrap"
							>
								{#if addingRepo === repo.name}
									<div
										class="absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center bg-accent-500/15"
									>
										<span class="text-xs text-white">Adding...</span>
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<div class="text-[15px] font-semibold text-white">{repo.name}</div>
									{#if repo.description}
										<div class="mt-0.5 text-sm text-neutral-400">{repo.description}</div>
									{/if}
								</div>

								<div class="shrink-0">
									{#if repo.inLibrary}
										<span class="text-xs text-neutral-500">In library</span>
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
												class="inline-flex cursor-pointer items-center rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
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
