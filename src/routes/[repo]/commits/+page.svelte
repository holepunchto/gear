<script lang="ts">
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import CommitMessage from '$lib/components/CommitMessage.svelte';
	import CommitDetails from '$lib/components/CommitDetails.svelte';
	import { relativeTime, isoDate, isRecent } from '$lib/time';

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

	// Cursor link for "older" — keeps ?ref= so paging stays scoped to the
	// active ref.
	const olderHref = $derived.by(() => {
		if (!data.nextCursor) return null;
		const q = new URLSearchParams({ cursor: data.nextCursor });
		if (data.ref) q.set('ref', data.ref);
		return `/${repoName}/commits?${q}`;
	});
</script>

{#if data.commits.length === 0}
	<div class="rounded-lg border border-neutral-800 bg-neutral-900 px-6 py-12 text-center">
		<h3 class="m-0 text-base font-semibold text-white">No commits</h3>
		<p class="mx-auto mt-2 max-w-md text-sm text-neutral-400">
			This branch hasn't received any commits yet.
		</p>
	</div>
{:else}
	<div class="space-y-5">
		{#each grouped as group (group.day)}
			<div>
				<h2
					class="mb-2 flex items-center gap-2 text-[12.5px] font-semibold tracking-wide text-neutral-400"
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
						class="text-neutral-500"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="3" />
						<path d="M12 3v3" />
						<path d="M12 18v3" />
						<path d="M3 12h3" />
						<path d="M18 12h3" />
					</svg>
					Commits on {group.label}
				</h2>
				<ul
					class="m-0 list-none overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-0"
				>
					{#each group.commits as commit (commit.oid)}
						{@const recent = isRecent(commit.timestamp)}
						{@const breaking = commit.message.hasBreaking}
						<li
							class="flex flex-wrap items-start gap-x-4 gap-y-1.5 border-b border-neutral-800 px-4 py-3 last:border-b-0 hover:bg-neutral-800/40 sm:px-5 sm:py-3.5
								{breaking ? 'border-l-4 border-l-red-500/70 bg-red-500/[0.03]' : ''}"
						>
							<div class="min-w-0 flex-1">
								<div class="flex items-start gap-2.5">
									<div
										class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full {recent
											? 'bg-apricot-500/15 text-apricot-300 ring-1 ring-apricot-500/30'
											: 'bg-neutral-800 text-neutral-500'}"
										aria-hidden="true"
									>
										<svg
											width="10"
											height="10"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.4"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<circle cx="12" cy="12" r="3" />
											<path d="M3 12h6" />
											<path d="M15 12h6" />
										</svg>
									</div>
									<div class="min-w-0 flex-1">
										<CommitMessage parsed={commit.message} variant="expanded" />
										<CommitDetails parsed={commit.message} />
										<div
											class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-neutral-500"
										>
											<span class="text-neutral-300">{commit.author ?? 'unknown'}</span>
											<span>committed</span>
											<span
												class={recent ? 'text-apricot-300' : 'text-neutral-400'}
												title={isoDate(commit.timestamp)}
											>
												{relativeTime(commit.timestamp)}
											</span>
											{#if commit.parents.length > 1}
												<span class="text-neutral-700">·</span>
												<span title={`Merge of ${commit.parents.length} parents`}>
													merge ({commit.parents.length} parents)
												</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-1.5">
								<button
									type="button"
									onclick={() => copyOid(commit.oid)}
									title="Copy commit hash"
									aria-label="Copy commit hash"
									class="rounded-md px-1.5 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
								>
									⧉
								</button>
								<code
									class="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11.5px] text-neutral-300"
									title={commit.oid}
								>
									{commit.oid.slice(0, 7)}
								</code>
							</div>
						</li>
					{/each}
				</ul>
			</div>
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
