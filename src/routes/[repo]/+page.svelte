<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#if data.empty}
	<div class="rounded-2xl bg-surface px-6 py-16 text-center ring-1 ring-line ring-inset">
		<h3 class="m-0 text-lg font-semibold text-fg">This repository is empty</h3>
		<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
			{#if data.repo.writable}
				Nothing has been pushed yet. Copy the clone command above, then run
				<span class="font-mono text-fg">git push</span>
				to send your first commit.
			{:else}
				Nothing has arrived yet. Blocks will appear here as soon as a peer that has this repo
				connects.
			{/if}
		</p>
	</div>
{/if}
