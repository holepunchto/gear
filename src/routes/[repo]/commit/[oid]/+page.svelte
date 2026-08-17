<script lang="ts">
	import { page } from '$app/state';
	import CommitMessage from '$lib/components/CommitMessage.svelte';
	import CommitBody from '$lib/components/CommitBody.svelte';
	import { relativeTime, isoDate, isRecent } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const repoName = $derived(page.params.repo);
	const c = $derived(data.commit);

	let copied = $state(false);

	async function copyOid() {
		try {
			await navigator.clipboard.writeText(c.oid);
			copied = true;
			setTimeout(() => (copied = false), 1200);
		} catch {}
	}
</script>

<div class="rounded-lg border border-neutral-800 bg-neutral-900">
	<div class="border-b border-neutral-800 px-4 py-4 sm:px-5">
		<div class="text-[15px]">
			<CommitMessage parsed={c.message} variant="expanded" />
		</div>
		<div class="mt-3 space-y-3">
			<CommitBody parsed={c.message} />
		</div>
	</div>

	<div
		class="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-3 text-[12.5px] text-neutral-500 sm:px-5"
	>
		<span class="text-neutral-300">{c.author ?? 'unknown'}</span>
		<span>committed</span>
		<span
			class={isRecent(c.timestamp) ? 'text-apricot-300' : 'text-neutral-400'}
			title={isoDate(c.timestamp)}
		>
			{relativeTime(c.timestamp)}
		</span>
		<span class="text-neutral-700">·</span>
		<span class="text-neutral-600">{isoDate(c.timestamp)}</span>

		<span class="ml-auto inline-flex items-center gap-1.5">
			<code
				class="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11.5px] break-all text-neutral-300"
			>
				{c.oid}
			</code>
			<button
				type="button"
				onclick={copyOid}
				title="Copy commit hash"
				aria-label="Copy commit hash"
				class="rounded-md px-1.5 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
			>
				{copied ? '✓' : '⧉'}
			</button>
		</span>
	</div>

	{#if c.parents.length}
		<div
			class="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-neutral-800 px-4 py-3 text-[12.5px] text-neutral-500 sm:px-5"
		>
			<span>{c.parents.length === 1 ? 'parent' : 'parents'}</span>
			{#each c.parents as parent}
				<a
					href="/{repoName}/commit/{parent}"
					class="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11.5px] text-neutral-300 no-underline transition-colors hover:border-neutral-700 hover:text-accent-300"
				>
					{parent.slice(0, 10)}
				</a>
			{/each}
		</div>
	{/if}
</div>
