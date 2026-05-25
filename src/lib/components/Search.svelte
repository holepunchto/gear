<script lang="ts">
	import { goto } from '$app/navigation';

	interface SearchHit {
		hex: string;
		matchedTerms: string[];
		inName: boolean;
		inDescription: boolean;
		inReadme: boolean;
		name?: string;
		repoUrl?: string;
	}

	interface ResultState extends SearchHit {
		description?: string;
		readmeSnippet?: string;
		metaLoading: boolean;
		readmeLoading: boolean;
	}

	let {
		active = $bindable(false),
		autofocus = false,
		onclose
	} = $props<{
		active?: boolean;
		autofocus?: boolean;
		onclose?: () => void;
	}>();

	let query = $state('');
	let searching = $state(false);
	let names = $state<string[]>([]);
	let results = $state<ResultState[]>([]);
	let inputEl = $state<HTMLInputElement | undefined>();
	let opening = $state<string | null>(null);
	let openErrorHex = $state<string | null>(null);
	let openError = $state<string | null>(null);

	const ghost = $derived(
		names.length > 0 && query.length > 0 && names[0].startsWith(query) ? names[0] : null
	);

	$effect(() => { active = query.trim().length > 0; });
	$effect(() => { if (autofocus) inputEl?.focus(); });

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab' || (e.key === 'ArrowRight' && ghost)) {
			e.preventDefault();
			if (ghost) query = ghost;
		}
	}

	function escapeHtml(text: string): string {
		return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
	}

	function highlight(text: string, terms: string[]): string {
		if (!text || terms.length === 0) return escapeHtml(text);
		const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
		return escapeHtml(text).replace(pattern, '<mark class="bg-yellow-400/25 text-yellow-100 rounded px-0.5">$1</mark>');
	}

	function updateResult(hex: string, patch: Partial<ResultState>) {
		const i = results.findIndex((r) => r.hex === hex);
		if (i !== -1) results[i] = { ...results[i], ...patch };
	}

	async function loadReadme(hit: SearchHit, repoUrl: string, isCancelled: () => boolean) {
		const rp = new URLSearchParams({ url: repoUrl, terms: hit.matchedTerms.join(',') });
		try {
			const { readme } = await fetch(`/search/readme?${rp}`).then((r) => r.json());
			if (isCancelled()) return;
			updateResult(hit.hex, { readmeSnippet: readme || undefined, readmeLoading: false });
		} catch {
			if (isCancelled()) return;
			updateResult(hit.hex, { readmeLoading: false });
		}
	}

	async function loadMeta(hit: SearchHit, isCancelled: () => boolean, attempt = 0) {
		if (isCancelled()) return;
		try {
			const meta: { name: string; description: string; repoUrl: string } = await fetch(
				`/search/meta?hex=${hit.hex}`
			).then((r) => r.json());

			if (isCancelled()) return;

			if (!meta.name && attempt < 4) {
				await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
				return loadMeta(hit, isCancelled, attempt + 1);
			}

			updateResult(hit.hex, {
				name: meta.name || undefined,
				description: meta.description || undefined,
				repoUrl: meta.repoUrl || undefined,
				metaLoading: false
			});

			if (hit.inReadme && meta.repoUrl) {
				loadReadme(hit, meta.repoUrl, isCancelled);
			} else {
				updateResult(hit.hex, { readmeLoading: false });
			}
		} catch {
			if (isCancelled()) return;
			if (attempt < 4) {
				await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
				return loadMeta(hit, isCancelled, attempt + 1);
			}
			updateResult(hit.hex, { metaLoading: false, readmeLoading: false });
		}
	}

	async function runSearch(q: string, isCancelled: () => boolean) {
		const res = await fetch(`/search/api?${new URLSearchParams({ q })}`);
		if (isCancelled()) return;

		const data = await res.json();
		names = data.names ?? [];
		const hits: SearchHit[] = data.results ?? [];

		// Snapshot existing data before the splice so we can preserve it.
		const prev = new Map(results.map((r) => [r.hex, r]));

		results.splice(0, results.length, ...hits.map((h) => {
			const p = prev.get(h.hex);
			return {
				...h,
				name: h.name ?? p?.name,
				repoUrl: h.repoUrl ?? p?.repoUrl,
				description: p?.description,
				readmeSnippet: p?.readmeSnippet,
				metaLoading: !h.name && !p?.name,
				readmeLoading: h.inReadme && !h.name && !p?.readmeSnippet
			};
		}));
		searching = false;

		for (const hit of hits) {
			if (!hit.name && !prev.get(hit.hex)?.name) loadMeta(hit, isCancelled);
		}
	}

	async function openResult(result: ResultState) {
		if (!result.repoUrl || opening) return;
		opening = result.hex;
		openError = null;
		openErrorHex = null;

		const fd = new FormData();
		fd.append('url', result.repoUrl);

		try {
			const res = await fetch('/?/add', { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true' } });
			const data = await res.json();
			if (data.type === 'redirect') {
				onclose?.();
				await goto(data.location);
			} else {
				openErrorHex = result.hex;
				openError = data.data?.add?.error ?? 'Failed to add repository';
				opening = null;
			}
		} catch {
			openErrorHex = result.hex;
			openError = 'Failed to open repository';
			opening = null;
		}
	}

	$effect(() => {
		const q = query.trim();
		if (!q) { names = []; results = []; return; }

		let cancelled = false;
		searching = true;

		const timer = setTimeout(async () => {
			try {
				await runSearch(q, () => cancelled);
			} catch {
				if (!cancelled) { names = []; results = []; searching = false; }
			}
		}, 300);

		return () => { cancelled = true; clearTimeout(timer); searching = false; };
	});

	const BADGES = [
		{ key: 'inName' as const, label: 'name' },
		{ key: 'inDescription' as const, label: 'desc' },
		{ key: 'inReadme' as const, label: 'readme' }
	];
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
			class="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 pr-28 pl-5 font-mono text-[15px] text-white shadow-md placeholder:text-neutral-600 focus:border-accent-500/70 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
		/>

		{#if ghost}
			<div aria-hidden="true" class="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-xl pr-28 pl-5 font-mono text-[15px]">
				<span class="text-transparent">{query}</span><!--
				--><span class="text-neutral-600">{ghost.slice(query.length)}</span>
			</div>
		{/if}

		<div class="pointer-events-none absolute top-0 right-0 flex h-full items-center gap-2 pr-4">
			{#if searching}
				<span class="text-xs text-neutral-600">searching…</span>
			{/if}
			{#if ghost}
				<kbd class="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-sans text-[10px] text-neutral-400">Tab</kbd>
			{/if}
		</div>
	</div>
</div>

<!-- Results — scrollable -->
{#if results.length > 0}
	<div class="overflow-y-auto border-t border-neutral-800 px-4 pb-4">
		<ul class="mt-4 space-y-3">
			{#each results as result (result.hex)}
				<li class="rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-4">

					<!-- Header: name/skeleton + match badges -->
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							{#if result.metaLoading}
								<div class="h-4 w-36 animate-pulse rounded bg-neutral-800"></div>
								<div class="mt-1.5 h-2.5 w-52 animate-pulse rounded bg-neutral-800/60"></div>
							{:else}
								<span class="font-mono text-[15px] font-semibold leading-snug text-white">
									{result.name ?? result.hex.slice(0, 12) + '…'}
								</span>
								{#if result.repoUrl}
									<p class="mt-0.5 min-w-0 truncate font-mono text-[11px] text-neutral-500">{result.repoUrl}</p>
								{/if}
							{/if}
						</div>
						<div class="mt-0.5 flex shrink-0 gap-1">
							{#each BADGES.filter((b) => result[b.key]) as badge}
								<span class="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">{badge.label}</span>
							{/each}
						</div>
					</div>

					<!-- Description -->
					{#if !result.metaLoading && result.description}
						<p class="mt-1.5 text-sm leading-relaxed text-neutral-300">
							{@html highlight(result.description, result.matchedTerms)}
						</p>
					{/if}

					<!-- Readme: skeleton while loading, snippet when ready -->
					{#if result.readmeLoading}
						<div class="mt-2 space-y-1.5 border-t border-neutral-800 pt-2">
							<div class="h-2.5 w-full animate-pulse rounded bg-neutral-800"></div>
							<div class="h-2.5 w-11/12 animate-pulse rounded bg-neutral-800"></div>
							<div class="h-2.5 w-4/5 animate-pulse rounded bg-neutral-800/60"></div>
						</div>
					{:else if result.readmeSnippet}
						<p class="mt-2 border-t border-neutral-800 pt-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-400">
							{@html highlight(result.readmeSnippet, result.matchedTerms)}
						</p>
					{/if}

					<!-- Footer: matched terms + open button -->
					<div class="mt-3 flex items-center justify-between gap-3">
						<div class="flex flex-wrap gap-1.5">
							{#each result.matchedTerms as term}
								<span class="rounded-full bg-accent-500/10 px-2 py-0.5 font-mono text-[11px] text-accent-300">{term}</span>
							{/each}
						</div>
						<button
							type="button"
							onclick={() => openResult(result)}
							disabled={!result.repoUrl || opening === result.hex}
							class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
						>
							{#if opening === result.hex}
								<svg class="h-3 w-3 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
									<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
								</svg>
								Adding…
							{:else}
								Open
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M5 12h14M12 5l7 7-7 7" />
								</svg>
							{/if}
						</button>
					</div>

					{#if openErrorHex === result.hex && openError}
						<p class="mt-1.5 text-xs text-red-400">{openError}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{:else if query.trim() && !searching}
	<div class="border-t border-neutral-800 px-4 py-4">
		<p class="text-sm text-neutral-500">No results for "{query}".</p>
	</div>
{/if}
