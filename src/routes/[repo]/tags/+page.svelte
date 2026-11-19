<script lang="ts">
	import type { LayoutData } from '../$types';
	import RefList from '$lib/components/RefList.svelte';
	import NewTag from '$lib/components/NewTag.svelte';

	let { data }: { data: LayoutData } = $props();

	let tagging = $state(false);
</script>

{#if data.repo.writable}
	<div class="mb-4 flex flex-col gap-3">
		{#if tagging}
			<section
				aria-label="New tag"
				class="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line ring-inset sm:p-5"
			>
				<div class="flex items-baseline justify-between gap-3">
					<h2 class="m-0 text-base font-semibold text-fg">New tag</h2>
					<button
						type="button"
						onclick={() => (tagging = false)}
						class="tap-44 cursor-pointer text-[13px] text-fg-3 hover:text-fg"
					>
						Cancel
					</button>
				</div>
				<NewTag
					repoName={data.repo.name}
					branches={data.repo.branches.map((b) => b.name)}
					head={data.repo.head}
				/>
			</section>
		{:else}
			<button
				type="button"
				onclick={() => (tagging = true)}
				class="inline-flex h-10 cursor-pointer items-center gap-2 self-end rounded-[10px] bg-surface-4 px-3.5 text-[13px] font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3"
			>
				New tag
			</button>
		{/if}
	</div>
{/if}

<RefList
	refs={data.repo.tags}
	repoName={data.repo.name}
	kind="tag"
	emptyTitle="No tags"
	emptyHint="Tag a commit to mark it as a release. Tags appear here once they're pushed."
/>
