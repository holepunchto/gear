<script lang="ts">
	import CommitMessage from '$lib/components/CommitMessage.svelte';
	import { compareBranches, compareTags } from '$lib/ref-order';
	import { relativeTime, isoDate } from '$lib/time';
	import type { RefEntry } from '$lib/server/repo';

	let {
		refs,
		repoName,
		headName = null,
		kind,
		emptyTitle,
		emptyHint
	}: {
		refs: RefEntry[];
		repoName: string;
		headName?: string | null;
		kind: 'branch' | 'tag';
		emptyTitle: string;
		emptyHint: string;
	} = $props();

	// Tags are versions — newest release first. Branches are navigation —
	// default first, then alphabetical.
	const sorted = $derived(
		kind === 'tag'
			? [...refs].sort((a, b) => compareTags(a.name, b.name))
			: [...refs].sort((a, b) => compareBranches(a.name, b.name, headName))
	);
</script>

{#if sorted.length === 0}
	<div class="rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-line ring-inset">
		<h3 class="m-0 text-base font-semibold text-white">{emptyTitle}</h3>
		<p class="mx-auto mt-1.5 max-w-md text-sm text-neutral-400">{emptyHint}</p>
	</div>
{:else}
	<div class="overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
		<ul class="m-0 list-none p-0">
			{#each sorted as ref (ref.name)}
				<li
					class="relative grid grid-cols-[1fr_auto] items-center gap-4 border-b border-white/[0.035] px-3.5 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2 sm:px-[18px]"
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
								class="text-accent-300"
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
								class="font-mono text-[13.5px] font-medium text-fg no-underline hover:text-accent-300"
							>
								{ref.name}
							</a>
							{#if ref.name === headName}
								<span
									class="rounded-full bg-accent-400/12 px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] text-accent-300 uppercase"
								>
									Default
								</span>
							{/if}
						</div>
						{#if ref.commit}
							<div class="mt-1.5 min-w-0 text-[13px] text-fg-2">
								<a
									href="/{repoName}/{ref.name}/"
									class="min-w-0 text-fg-2 no-underline hover:text-accent-300"
								>
									<CommitMessage parsed={ref.commit.message} variant="compact" />
								</a>
							</div>
						{/if}
						<div class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
							<span class="font-mono" title={ref.oid}>{ref.oid.slice(0, 7)}</span>
							{#if ref.commit}
								{#if ref.commit.author}
									<span aria-hidden="true">·</span>
									<span class="truncate">{ref.commit.author}</span>
								{/if}
								<span aria-hidden="true">·</span>
								<span title={isoDate(ref.commit.timestamp)}>
									{relativeTime(ref.commit.timestamp)}
								</span>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<!-- Stretched link — the before: overlay makes the whole row navigate. -->
						<a
							href="/{repoName}/{ref.name}/"
							class="inline-flex items-center rounded-lg bg-surface-3 px-3 py-1.5 text-xs font-medium text-fg no-underline ring-1 ring-line-strong ring-inset before:absolute before:inset-0 hover:bg-surface-4"
						>
							Browse
						</a>
					</div>
				</li>
			{/each}
		</ul>
	</div>
{/if}
