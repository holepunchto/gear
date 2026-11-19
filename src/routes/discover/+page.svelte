<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import ReleaseLine from '$lib/components/releases/ReleaseLine.svelte';
	import { linkKey } from '$lib/releases';

	type DiscoverRepo = { name: string; url: string; description?: string | null };
	type Sort = 'name' | 'size';

	let { data }: PageProps = $props();

	let query = $state('');
	let sort = $state<Sort>('name');
	let inputEl = $state<HTMLInputElement | undefined>();
	let adding = $state<string | null>(null);
	let addError = $state<{ name: string; message: string } | null>(null);

	const library = $derived(new Set(data.repoNames));
	const q = $derived(query.trim().toLowerCase());

	// Our own replaceState gotos already match local state; anything else
	// (load, back/forward, the nav link) reads the query back from the URL.
	afterNavigate(({ type }) => {
		if (type === 'goto') return;
		query = page.url.searchParams.get('q') ?? '';
		sort = page.url.searchParams.get('sort') === 'size' ? 'size' : 'name';
	});

	$effect(() => {
		if (matchMedia('(min-width: 640px)').matches) inputEl?.focus();
	});

	function syncUrl() {
		const url = new URL(page.url);
		if (query) url.searchParams.set('q', query);
		else url.searchParams.delete('q');
		if (sort === 'size') url.searchParams.set('sort', 'size');
		else url.searchParams.delete('sort');
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function setSort(next: Sort) {
		sort = next;
		syncUrl();
	}

	function clear() {
		query = '';
		syncUrl();
		inputEl?.focus();
	}

	// The link's length hint is the repo's size in blocks when it was published.
	function blocks(url: string) {
		return Number(url.match(/^git\+pear:\/\/0\.(\d+)\./)?.[1] ?? 0);
	}

	function results(all: DiscoverRepo[]) {
		const hits = q
			? all.filter(
					(r) => r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)
				)
			: all.slice();
		return sort === 'size'
			? hits.sort((a, b) => blocks(b.url) - blocks(a.url) || a.name.localeCompare(b.name))
			: hits.sort((a, b) => a.name.localeCompare(b.name));
	}

	function parts(text: string) {
		if (!q) return [{ text, match: false }];
		const out: { text: string; match: boolean }[] = [];
		const lower = text.toLowerCase();
		let i = 0;
		for (let j = lower.indexOf(q); j !== -1; j = lower.indexOf(q, i)) {
			if (j > i) out.push({ text: text.slice(i, j), match: false });
			out.push({ text: text.slice(j, j + q.length), match: true });
			i = j + q.length;
		}
		if (i < text.length) out.push({ text: text.slice(i), match: false });
		return out;
	}
</script>

<svelte:head>
	<title>Discover · Gear</title>
</svelte:head>

{#snippet highlight(text: string)}
	{#each parts(text) as p, i (i)}
		{#if p.match}<mark class="rounded-[3px] bg-accent-400/15 text-accent-100">{p.text}</mark
			>{:else}{p.text}{/if}
	{/each}
{/snippet}

<main class="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pt-6 pb-20 sm:px-8 sm:pt-10">
	<header class="flex flex-col gap-2">
		<h1
			class="m-0 font-display text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-fg sm:text-[44px]"
		>
			Discover
		</h1>
		<p class="m-0 max-w-[560px] text-[15px] leading-normal text-fg-2">
			Repositories published by Holepunch. The list updates over the air and works offline. Add one
			and it syncs from peers.
		</p>
	</header>

	<label class="relative flex items-center">
		<span class="sr-only">Search Discover</span>
		<svg
			class="pointer-events-none absolute left-3.5 text-fg-3"
			width="18"
			height="18"
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
		<input
			bind:this={inputEl}
			bind:value={query}
			oninput={syncUrl}
			onkeydown={(e) => {
				if (e.key === 'Escape' && query) {
					e.stopPropagation();
					clear();
				}
			}}
			type="search"
			placeholder="Search by name or description"
			autocomplete="off"
			spellcheck="false"
			class="h-12 w-full rounded-xl border-0 bg-surface-2 pr-11 pl-11 text-[15px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
		/>
		{#if query}
			<button
				type="button"
				onclick={clear}
				aria-label="Clear search"
				class="tap-44 absolute right-2.5 grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-fg-3 transition-colors hover:bg-surface-4 hover:text-fg"
			>
				✕
			</button>
		{/if}
	</label>

	{#await data.discover}
		<p class="m-0 h-9 w-48 animate-pulse-soft rounded bg-surface-3/60" aria-hidden="true"></p>
		<ul
			aria-label="Loading the manifest"
			class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,520px),1fr))] gap-3 p-0"
		>
			{#each { length: 8 }, i (i)}
				<li class="flex gap-3.5 rounded-2xl bg-surface p-4 ring-1 ring-line ring-inset">
					<span class="h-10 w-10 shrink-0 animate-pulse-soft rounded-[10px] bg-surface-3"></span>
					<span class="flex flex-1 flex-col gap-2.5 pt-1">
						<span class="h-3.5 w-32 animate-pulse-soft rounded bg-surface-3"></span>
						<span class="h-2.5 w-4/5 animate-pulse-soft rounded bg-surface-3"></span>
						<span class="h-2.5 w-24 animate-pulse-soft rounded bg-surface-3"></span>
					</span>
				</li>
			{/each}
		</ul>
	{:then all}
		{@const list = results(all)}
		{@const owned = all.filter((r) => library.has(r.name)).length}
		{@const largest = Math.max(1, ...all.map((r) => blocks(r.url)))}

		<div class="flex items-center justify-between gap-3">
			<p class="m-0 text-sm text-fg-2 tabular-nums" aria-live="polite">
				{#if q}
					{list.length} of {all.length} repos match
				{:else}
					{all.length} repos · {owned} in your library
				{/if}
			</p>
			<div
				role="group"
				aria-label="Sort by"
				class="flex h-9 shrink-0 items-center gap-0.5 rounded-[10px] bg-surface-2 p-1 ring-1 ring-line-strong ring-inset"
			>
				<span class="hidden px-2 text-[13px] text-fg-3 sm:inline" aria-hidden="true">Sort</span>
				{#each [['name', 'Name'], ['size', 'Size']] as [value, label] (value)}
					<button
						type="button"
						onclick={() => setSort(value as Sort)}
						aria-pressed={sort === value}
						class="h-full cursor-pointer rounded-[7px] px-3 text-[13px] font-medium transition-colors {sort ===
						value
							? 'bg-surface-4 text-fg'
							: 'text-fg-2 hover:text-fg'}"
					>
						{label}
					</button>
				{/each}
			</div>
		</div>

		{#if list.length === 0}
			<div class="rounded-2xl bg-surface px-6 py-14 text-center ring-1 ring-line ring-inset">
				<h2 class="m-0 text-base font-semibold text-fg">
					{all.length === 0 ? 'The manifest is empty' : `Nothing matches “${query.trim()}”`}
				</h2>
				<p class="mx-auto mt-1.5 max-w-[420px] text-sm text-fg-2">
					{#if all.length > 0}
						Try a shorter search. If you have a <span class="font-mono text-fg">git+pear://</span>
						link, add it from your <a href="/" class="text-accent-300">library</a>.
					{:else}
						No repositories are listed yet. Add one by its link from your
						<a href="/" class="text-accent-300">library</a>.
					{/if}
				</p>
				{#if all.length > 0}
					<button
						type="button"
						onclick={clear}
						class="mt-4 cursor-pointer rounded-lg bg-surface-3 px-3.5 py-2 text-[13px] font-medium text-fg ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-4"
					>
						Clear search
					</button>
				{/if}
			</div>
		{:else}
			<ul
				class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,520px),1fr))] gap-3 p-0"
			>
				{#each list as d (d.name)}
					{@const have = library.has(d.name)}
					{@const size = blocks(d.url)}
					{@const release = data.badges[linkKey(d.url) ?? '']}
					<li class="flex gap-3.5 rounded-2xl bg-surface p-4 ring-1 ring-line ring-inset">
						<span
							aria-hidden="true"
							class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-surface-3 font-mono text-sm font-semibold text-accent-300"
						>
							{d.name.slice(0, 2)}
						</span>

						<div class="flex min-w-0 flex-1 flex-col gap-1.5">
							<div class="flex min-h-8 items-center gap-3">
								<h2
									class="m-0 min-w-0 flex-1 truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-fg"
								>
									{#if have}
										<a href="/{d.name}" class="text-fg no-underline hover:underline"
											>{@render highlight(d.name)}</a
										>
									{:else}
										{@render highlight(d.name)}
									{/if}
								</h2>

								{#if have}
									<a
										href="/{d.name}"
										class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-fg-2 no-underline ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-3 hover:text-fg"
									>
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.6"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<path d="M5 13l4 4L19 7" />
										</svg>
										In library
									</a>
								{:else}
									<form
										method="POST"
										action="/?/addFromSource"
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
											class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-accent-400/10 px-3 text-[13px] font-semibold text-accent-300 transition-colors hover:bg-accent-400/20 disabled:cursor-not-allowed disabled:opacity-40"
										>
											{#if adding === d.name}
												<span
													class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-400/30 border-t-accent-300"
												></span>
												Adding…
											{:else}
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2.6"
													stroke-linecap="round"
													aria-hidden="true"
												>
													<path d="M12 5v14M5 12h14" />
												</svg>
												Add
											{/if}
										</button>
									</form>
								{/if}
							</div>

							{#if d.description}
								<p class="m-0 line-clamp-2 text-sm leading-snug text-fg-2">
									{@render highlight(d.description)}
								</p>
							{/if}

							<div class="mt-1 flex items-center gap-2.5 text-xs text-fg-3 tabular-nums">
								<!-- Log scale, so a 50-block repo still registers next to a 10,000-block one. -->
								<span class="h-1 w-16 overflow-hidden rounded-full bg-surface-4" aria-hidden="true">
									<span
										class="block h-full rounded-full bg-pear-500"
										style:width="{Math.max(4, (Math.log1p(size) / Math.log1p(largest)) * 100)}%"
									></span>
								</span>
								{size.toLocaleString()} blocks
								{#if release}
									<span class="ml-auto min-w-0"><ReleaseLine {release} /></span>
								{/if}
							</div>

							{#if addError?.name === d.name}
								<p class="m-0 text-xs text-red-400">{addError.message}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/await}
</main>
