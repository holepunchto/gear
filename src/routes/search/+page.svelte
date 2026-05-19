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

	let bootstrap = $state('127.0.0.1:49741');
	let nameIndexID = $state('25032ce809a1c133016b9853badbffb30a0e28f0d27c0d2d5751d45afc42f6a6');
	let fullIndexID = $state('0865d6c073d41e3299d0d08cc5ceff31edc92c909c9d9e08c6bbedd9c25cd8bd');
	let query = $state('');
	let searching = $state(false);
	let names = $state<string[]>([]);
	let results = $state<ResultWithReadme[]>([]);

	// First name suggestion that starts with the current query.
	const ghost = $derived(
		names.length > 0 && query.length > 0 && names[0].startsWith(query) ? names[0] : null
	);

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
		const bs = bootstrap.trim();
		const nid = nameIndexID.trim();
		const fid = fullIndexID.trim();

		if (!q || !bs) {
			names = [];
			results = [];
			return;
		}

		let cancelled = false;
		searching = true;

		const timer = setTimeout(async () => {
			const params = new URLSearchParams({ q, bootstrap: bs, nameIndexID: nid, fullIndexID: fid });
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
				// Lazy-load READMEs for results that matched in readme
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

<svelte:head>
	<title>Search · Gear</title>
</svelte:head>

<main class="mx-auto max-w-[800px] px-4 pt-8 pb-20 sm:px-6">
	<!-- Connection config -->
	<details class="mb-5 hidden rounded-lg border border-neutral-800 bg-neutral-900">
		<summary
			class="cursor-pointer px-4 py-3 text-xs font-semibold tracking-widest text-neutral-500 uppercase select-none"
		>
			Connection — paste from <span class="font-mono normal-case">bootstrap.js</span>
		</summary>
		<div class="space-y-3 border-t border-neutral-800 p-4">
			<div>
				<label for="bootstrap" class="mb-1 block text-xs text-neutral-400">Bootstrap</label>
				<input
					id="bootstrap"
					type="text"
					bind:value={bootstrap}
					placeholder="127.0.0.1:49152"
					class="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
				/>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label for="nameIndexID" class="mb-1 block text-xs text-neutral-400">Name index ID</label>
					<input
						id="nameIndexID"
						type="text"
						bind:value={nameIndexID}
						placeholder="(Name index ID)"
						class="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[11px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
					/>
				</div>
				<div>
					<label for="fullIndexID" class="mb-1 block text-xs text-neutral-400"
						>Full-text index ID</label
					>
					<input
						id="fullIndexID"
						type="text"
						bind:value={fullIndexID}
						placeholder="(Full-text index ID)"
						class="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[11px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
					/>
				</div>
			</div>
		</div>
	</details>

	<!-- Search bar
		 Ghost is positioned ABOVE the input (pointer-events-none, comes after input in DOM
		 so it's higher in stacking order). The typed portion is text-transparent so the
		 input's own white text shows through underneath. Only the completion tail is gray. -->
	<div class="relative">
		<input
			type="text"
			bind:value={query}
			onkeydown={handleKeydown}
			placeholder="Search repositories…"
			autofocus
			class="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 pr-28 pl-5 font-mono text-[15px] text-white shadow-md placeholder:text-neutral-600 focus:border-accent-500/70 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
		/>

		<!-- Ghost layer: ABOVE the input (later in DOM = higher stacking) -->
		{#if ghost}
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-xl pr-28 pl-5 font-mono text-[15px]"
			>
				<!-- Typed portion: transparent so the real input text underneath shows through -->
				<span class="text-transparent">{query}</span><!--
				--><!-- Completion tail: faint gray -->
				<span class="text-neutral-600">{ghost.slice(query.length)}</span>
			</div>
		{/if}

		<!-- Right side: spinner / tab hint -->
		<div class="pointer-events-none absolute top-0 right-0 flex h-full items-center gap-2 pr-4">
			{#if searching}
				<span class="text-xs text-neutral-600">searching…</span>
			{/if}
			{#if ghost}
				<kbd
					class="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-sans text-[10px] text-neutral-400"
					>Tab</kbd
				>
			{/if}
		</div>
	</div>

	<!-- Full-text results -->
	{#if results.length > 0}
		<ul class="mt-5 space-y-3">
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
								<span
									class="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
									>name</span
								>
							{/if}
							{#if result.inDescription}
								<span
									class="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
									>description</span
								>
							{/if}
							{#if result.inReadme}
								<span
									class="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
									>readme</span
								>
							{/if}
						</div>
					</div>

					{#if result.descriptionSnippet}
						<p class="mt-1.5 text-sm leading-relaxed text-neutral-300">
							{@html highlight(result.descriptionSnippet, result.matchedTerms)}
						</p>
					{/if}

					{#if result.readmeLoading}
						<p class="mt-2 border-t border-neutral-800 pt-2 text-xs text-neutral-600">
							loading readme…
						</p>
					{:else if result.readmeSnippet}
						<p
							class="mt-2 border-t border-neutral-800 pt-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-400"
						>
							{@html highlight(result.readmeSnippet, result.matchedTerms)}
						</p>
					{/if}

					<div class="mt-2.5 flex flex-wrap gap-1.5">
						{#each result.matchedTerms as term}
							<span
								class="rounded-full bg-accent-500/10 px-2 py-0.5 font-mono text-[11px] text-accent-300"
								>{term}</span
							>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	{:else if query.trim() && !searching}
		<p class="mt-6 text-sm text-neutral-500">No results for "{query}".</p>
	{/if}
</main>
