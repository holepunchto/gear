<script lang="ts">
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import CommitMessage from '$lib/components/CommitMessage.svelte';
	import CommitDetails from '$lib/components/CommitDetails.svelte';
	import { relativeTime, isoDate, isRecent } from '$lib/time';
	import { initials } from '$lib/initials';

	let { data }: PageProps = $props();

	const repoName = $derived(page.params.repo);

	// Group commits by calendar day (in viewer's local time) so we can render
	// the "Commits on <date>" headers GitHub uses. Done client-side because
	// the day depends on the viewer's timezone — server has no idea.
	type Commit = (typeof data.commits)[number];
	const grouped = $derived.by(() => {
		const groups: { day: string; label: string; commits: Commit[] }[] = [];
		let current: { day: string; label: string; commits: Commit[] } | null = null;
		for (const c of data.commits) {
			const d = new Date(c.timestamp * 1000);
			const day = d.toISOString().slice(0, 10);
			if (!current || current.day !== day) {
				current = {
					day,
					label: d.toLocaleDateString(undefined, {
						weekday: 'short',
						month: 'short',
						day: 'numeric',
						year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
					}),
					commits: []
				};
				groups.push(current);
			}
			current.commits.push(c);
		}
		return groups;
	});

	async function copyOid(oid: string) {
		try {
			await navigator.clipboard.writeText(oid);
		} catch {}
	}

	// Cursor link for "older" — keeps ?ref= and ?path= so paging stays scoped
	// to the active ref (and file, when this is a file history).
	const olderHref = $derived.by(() => {
		if (!data.nextCursor) return null;
		const q = new URLSearchParams({ cursor: data.nextCursor });
		if (data.ref) q.set('ref', data.ref);
		if (data.path) q.set('path', data.path);
		return `/${repoName}/commits?${q}`;
	});
</script>

{#if data.path}
	<!-- File-history header — the list below is filtered to commits that
		touched this path. -->
	<div
		class="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-surface px-3.5 py-2.5 text-[13px] text-fg-2 ring-1 ring-line ring-inset"
	>
		<span>History for</span>
		<a
			href="/{repoName}/{data.ref}/{data.path}"
			class="font-mono font-medium text-white no-underline hover:text-accent-300"
		>
			{data.path}
		</a>
		<span class="text-neutral-700">·</span>
		<a
			href="/{repoName}/commits{data.ref ? `?ref=${encodeURIComponent(data.ref)}` : ''}"
			class="text-neutral-500 no-underline hover:text-accent-300"
		>
			All commits
		</a>
	</div>
{/if}

{#if data.commits.length === 0}
	<div class="rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-line ring-inset">
		<h3 class="m-0 text-base font-semibold text-fg">No commits</h3>
		<p class="mx-auto mt-2 max-w-md text-sm text-fg-2">
			This branch hasn't received any commits yet.
		</p>
	</div>
{:else}
	<div>
		{#each grouped as group (group.day)}
			<section aria-label="Commits on {group.label}" class="pb-1.5">
				<h2
					class="m-0 mt-2.5 mb-1.5 ml-7 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase"
				>
					{group.label}
				</h2>
				<ol class="m-0 list-none p-0">
					{#each group.commits as commit (commit.oid)}
						{@const recent = isRecent(commit.timestamp)}
						{@const breaking = commit.message.hasBreaking}
						<li class="flex gap-3.5">
							<div aria-hidden="true" class="flex w-3.5 flex-none flex-col items-center">
								<span class="h-4 w-0.5 bg-neutral-800"></span>
								<span
									class="shrink-0 rounded-full {recent
										? 'h-2.5 w-2.5 bg-accent-400'
										: 'h-2 w-2 bg-bg ring-2 ring-pear-500 ring-inset'}"
								></span>
								<span class="w-0.5 flex-1 bg-neutral-800"></span>
							</div>
							<div
								class="my-1.5 flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-inset sm:px-4 sm:py-3 {breaking
									? 'ring-red-400/40'
									: 'ring-line'}"
							>
								<a
									href="/{repoName}/commit/{commit.oid}"
									class="flex min-w-0 text-sm font-medium text-fg no-underline hover:text-accent-200"
								>
									<CommitMessage parsed={commit.message} variant="compact" />
								</a>
								<CommitDetails parsed={commit.message} />
								<div class="flex min-w-0 items-center gap-2 text-xs text-fg-3">
									<span
										aria-hidden="true"
										class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-pear-700 text-[8px] font-semibold text-accent-100"
									>
										{initials(commit.author)}
									</span>
									<span class="truncate text-fg-2">{commit.author ?? 'unknown'}</span>
									<span class="shrink-0" title={isoDate(commit.timestamp)}>
										· {relativeTime(commit.timestamp)}
									</span>
									{#if commit.parents.length > 1}
										<span
											class="hidden shrink-0 sm:inline"
											title={`Merge of ${commit.parents.length} parents`}
										>
											· merge ({commit.parents.length} parents)
										</span>
									{/if}
									<span class="ml-auto flex shrink-0 items-center gap-1">
										<button
											type="button"
											onclick={() => copyOid(commit.oid)}
											title="Copy commit hash"
											aria-label="Copy commit hash"
											class="tap-44 cursor-pointer rounded-md px-1.5 py-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg"
										>
											⧉
										</button>
										<a
											href="/{repoName}/commit/{commit.oid}"
											class="tap-44 font-mono text-fg-3 no-underline hover:text-accent-300"
											title={commit.oid}
										>
											{commit.oid.slice(0, 7)}
										</a>
									</span>
								</div>
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{/each}

		{#if olderHref}
			<div class="flex justify-center pt-2">
				<a
					href={olderHref}
					class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white no-underline transition-colors hover:border-neutral-600 hover:bg-neutral-800"
				>
					Older commits
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
						<path d="M5 12h14" />
						<path d="m12 5 7 7-7 7" />
					</svg>
				</a>
			</div>
		{/if}
	</div>
{/if}
