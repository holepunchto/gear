<script lang="ts">
	import { goto } from '$app/navigation';

	type DiscoverRepo = { name: string; url: string; description?: string | null };

	let {
		repos,
		library = [],
		autofocus = false,
		onclose
	} = $props<{
		repos: DiscoverRepo[];
		library?: string[];
		autofocus?: boolean;
		onclose?: () => void;
	}>();

	let query = $state('');
	let inputEl = $state<HTMLInputElement | undefined>();
	let adding = $state<string | null>(null);
	let addErrorName = $state<string | null>(null);
	let addError = $state<string | null>(null);

	const q = $derived(query.trim().toLowerCase());

	// Client-side name search over the ota manifest — prefix matches first,
	// then alphabetical. An empty query shows the whole curated list.
	const hits = $derived(
		(repos as DiscoverRepo[])
			.filter((r) => r.name.toLowerCase().includes(q))
			.sort((a, b) => {
				const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
				const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
				return ap - bp || a.name.localeCompare(b.name);
			})
	);

	const ghost = $derived(
		q &&
			hits.length > 0 &&
			hits[0].name.toLowerCase().startsWith(q) &&
			hits[0].name.length > q.length
			? hits[0].name
			: null
	);

	const inLibrary = $derived(new Set(library as string[]));

	$effect(() => {
		if (autofocus) inputEl?.focus();
	});

	function handleKeydown(e: KeyboardEvent) {
		if ((e.key === 'Tab' || e.key === 'ArrowRight') && ghost) {
			e.preventDefault();
			query = ghost;
		}
	}

	async function add(repo: DiscoverRepo) {
		if (adding) return;
		adding = repo.name;
		addError = null;
		addErrorName = null;

		const fd = new FormData();
		fd.append('name', repo.name);
		fd.append('url', repo.url);

		try {
			const res = await fetch('/?/addFromSource', {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const data = await res.json();
			if (data.type === 'redirect') {
				onclose?.();
				await goto(data.location, { invalidateAll: true });
			} else {
				addErrorName = repo.name;
				addError = data.data?.addFromSource?.error ?? 'Failed to add repository';
			}
		} catch {
			addErrorName = repo.name;
			addError = 'Failed to add repository';
		}
		adding = null;
	}
</script>

<!-- Input — always pinned, never scrolls -->
<div class="shrink-0 px-4 pt-4 pb-3">
	<div class="relative">
		<input
			bind:this={inputEl}
			type="text"
			bind:value={query}
			onkeydown={handleKeydown}
			placeholder="Search repositories…"
			class="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 pr-16 pl-5 font-mono text-[15px] text-white shadow-md placeholder:text-neutral-600 focus:border-accent-500/70 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
		/>

		{#if ghost}
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-xl pr-16 pl-5 font-mono text-[15px]"
			>
				<span class="text-transparent">{query}</span><!--
				--><span class="text-neutral-600"
					>{ghost.slice(query.length)}</span
				>
			</div>
		{/if}

		{#if ghost}
			<div class="pointer-events-none absolute top-0 right-0 flex h-full items-center pr-4">
				<kbd
					class="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-sans text-[10px] text-neutral-400"
					>Tab</kbd
				>
			</div>
		{/if}
	</div>
</div>

<!-- Results — scrollable -->
{#if hits.length > 0}
	<div class="overflow-y-auto border-t border-neutral-800 px-4 pb-4">
		<ul class="m-0 mt-4 list-none space-y-3 p-0">
			{#each hits as repo (repo.name)}
				<li class="rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-4">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<span class="font-mono text-[15px] leading-snug font-semibold text-white">
								{repo.name}
							</span>
							<p class="mt-0.5 min-w-0 truncate font-mono text-[11px] text-neutral-500">
								{repo.url}
							</p>
							{#if repo.description}
								<p class="mt-1.5 mb-0 text-sm leading-relaxed text-neutral-300">
									{repo.description}
								</p>
							{/if}
						</div>

						{#if inLibrary.has(repo.name)}
							<a
								href="/{repo.name}"
								onclick={() => onclose?.()}
								class="inline-flex shrink-0 items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 no-underline transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
							>
								Open
								<svg
									width="10"
									height="10"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M5 12h14M12 5l7 7-7 7" />
								</svg>
							</a>
						{:else}
							<button
								type="button"
								onclick={() => add(repo)}
								disabled={!!adding}
								class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
							>
								{#if adding === repo.name}
									<svg
										class="h-3 w-3 animate-spin text-neutral-400"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										aria-hidden="true"
									>
										<path
											d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
										/>
									</svg>
									Adding…
								{:else}
									Add
								{/if}
							</button>
						{/if}
					</div>

					{#if addErrorName === repo.name && addError}
						<p class="mt-1.5 mb-0 text-xs text-red-400">{addError}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{:else}
	<div class="border-t border-neutral-800 px-4 py-4">
		<p class="m-0 text-sm text-neutral-500">
			{#if q}
				No repositories matching "{query}".
			{:else}
				Nothing to discover yet.
			{/if}
		</p>
	</div>
{/if}
