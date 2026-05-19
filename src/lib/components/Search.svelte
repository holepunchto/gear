<script lang="ts">
	interface Result {
		hex: string;
		url: string;
		name: string;
		matchedTerms: string[];
		inName: boolean;
		inDescription: boolean;
		inReadme: boolean;
		descriptionSnippet: string;
	}

	interface ResultWithReadme extends Result {
		readmeSnippet?: string;
		readmeLoading?: boolean;
	}

	let {
		active = $bindable(false),
		autofocus = false,
		size = 'default'
	} = $props<{
		active?: boolean;
		autofocus?: boolean;
		size?: 'default' | 'lg';
	}>();

	let query = $state('');
	let searching = $state(false);
	let names = $state<string[]>([]);
	let results = $state<ResultWithReadme[]>([]);
	let inputEl = $state<HTMLInputElement | undefined>();

	const isLg = $derived(size === 'lg');

	const ghost = $derived(
		names.length > 0 && query.length > 0 && names[0].startsWith(query) ? names[0] : null
	);

	$effect(() => {
		active = query.trim().length > 0;
	});

	$effect(() => {
		if (autofocus) inputEl?.focus();
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			e.preventDefault();
			if (ghost) query = ghost;
		} else if (e.key === 'ArrowRight' && ghost) {
			e.preventDefault();
			query = ghost;
		}
	}

	function escapeHtml(text: string): string {
		return text.replace(
			/[&<>"]/g,
			(c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
		);
	}

	function highlight(text: string, terms: string[]): string {
		if (!text || terms.length === 0) return escapeHtml(text);
		const pattern = new RegExp(
			`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
			'gi'
		);
		return escapeHtml(text).replace(
			pattern,
			'<mark class="bg-yellow-400/25 text-yellow-100 rounded px-0.5">$1</mark>'
		);
	}

	$effect(() => {
		const q = query.trim();

		if (!q) {
			names = [];
			results = [];
			return;
		}

		let cancelled = false;
		searching = true;

		const timer = setTimeout(async () => {
			const params = new URLSearchParams({ q });
			try {
				const res = await fetch(`/search/api?${params}`);
				if (cancelled) return;
				const data = await res.json();
				names = data.names ?? [];
				const fetched: ResultWithReadme[] = (data.results ?? []).map((r: Result) => ({
					...r,
					readmeSnippet: undefined,
					readmeLoading: r.inReadme
				}));
				results = fetched;
				for (const result of fetched) {
					if (!result.inReadme || cancelled) continue;
					const rp = new URLSearchParams({ url: result.url, terms: result.matchedTerms.join(',') });
					fetch(`/search/readme?${rp}`)
						.then((r) => r.json())
						.then((d) => {
							if (cancelled) return;
							results = results.map((r) =>
								r.hex === result.hex
									? { ...r, readmeSnippet: d.readme ?? '', readmeLoading: false }
									: r
							);
						})
						.catch(() => {
							if (!cancelled) {
								results = results.map((r) =>
									r.hex === result.hex ? { ...r, readmeLoading: false } : r
								);
							}
						});
				}
			} catch {
				if (!cancelled) {
					names = [];
					results = [];
				}
			} finally {
				if (!cancelled) searching = false;
			}
		}, 300);

		return () => {
			cancelled = true;
			clearTimeout(timer);
			searching = false;
		};
	});
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
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-xl pr-28 pl-5 font-mono text-[15px]"
			>
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
					<div class="flex items-start justify-between gap-4">
						<div>
							<span class="font-mono text-[15px] leading-snug font-semibold text-white"
								>{result.name}</span
							>
							{#if result.url}
								<p class="mt-0.5 font-mono text-[11px] text-neutral-500">{result.url}</p>
							{/if}
						</div>
						<div class="mt-0.5 flex shrink-0 gap-1">
							{#if result.inName}
								<span class="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">name</span>
							{/if}
							{#if result.inDescription}
								<span class="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">desc</span>
							{/if}
							{#if result.inReadme}
								<span class="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">readme</span>
							{/if}
						</div>
					</div>

					{#if result.descriptionSnippet}
						<p class="mt-1.5 text-sm leading-relaxed text-neutral-300">
							{@html highlight(result.descriptionSnippet, result.matchedTerms)}
						</p>
					{/if}

					{#if result.readmeLoading}
						<p class="mt-2 border-t border-neutral-800 pt-2 text-xs text-neutral-600">loading readme…</p>
					{:else if result.readmeSnippet}
						<p class="mt-2 border-t border-neutral-800 pt-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-400">
							{@html highlight(result.readmeSnippet, result.matchedTerms)}
						</p>
					{/if}

					<div class="mt-2.5 flex flex-wrap gap-1.5">
						{#each result.matchedTerms as term}
							<span class="rounded-full bg-accent-500/10 px-2 py-0.5 font-mono text-[11px] text-accent-300">{term}</span>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	</div>
{:else if query.trim() && !searching}
	<div class="border-t border-neutral-800 px-4 py-4">
		<p class="text-sm text-neutral-500">No results for "{query}".</p>
	</div>
{/if}
