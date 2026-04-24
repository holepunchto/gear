<script lang="ts">
	type Ref = { name: string; oid: string };

	let {
		refs,
		repoName,
		headName = null,
		kind,
		emptyTitle,
		emptyHint
	}: {
		refs: Ref[];
		repoName: string;
		headName?: string | null;
		kind: 'branch' | 'tag';
		emptyTitle: string;
		emptyHint: string;
	} = $props();

	const sorted = $derived(
		[...refs].sort((a, b) => {
			// Pin HEAD branch first when present, then alphabetical.
			if (a.name === headName) return -1;
			if (b.name === headName) return 1;
			return a.name.localeCompare(b.name);
		})
	);
</script>

{#if sorted.length === 0}
	<div class="rounded-lg border border-dashed border-neutral-800 bg-neutral-900 px-6 py-12 text-center">
		<h3 class="m-0 text-base font-semibold text-white">{emptyTitle}</h3>
		<p class="mx-auto mt-1.5 max-w-md text-sm text-neutral-400">{emptyHint}</p>
	</div>
{:else}
	<div class="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
		<ul class="m-0 list-none p-0">
			{#each sorted as ref (ref.name)}
				<li
					class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-neutral-800 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-neutral-800/40"
				>
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="text-neutral-500"
								aria-hidden="true"
							>
								{#if kind === 'branch'}
									<line x1="6" x2="6" y1="3" y2="15" />
									<circle cx="18" cy="6" r="3" />
									<circle cx="6" cy="18" r="3" />
									<path d="M18 9a9 9 0 0 1-9 9" />
								{:else}
									<path
										d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
									/>
									<line x1="7" x2="7.01" y1="7" y2="7" />
								{/if}
							</svg>
							<a
								href="/{repoName}/{ref.name}/"
								class="font-mono text-[13.5px] font-medium text-white no-underline hover:text-accent-400"
							>
								{ref.name}
							</a>
							{#if ref.name === headName}
								<span
									class="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-300"
								>
									Default
								</span>
							{/if}
						</div>
						<div class="mt-1 font-mono text-[11.5px] text-neutral-500" title={ref.oid}>
							{ref.oid.slice(0, 10)}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<a
							href="/{repoName}/{ref.name}/"
							class="inline-flex items-center rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white no-underline hover:bg-neutral-700"
						>
							Browse
						</a>
					</div>
				</li>
			{/each}
		</ul>
	</div>
{/if}
