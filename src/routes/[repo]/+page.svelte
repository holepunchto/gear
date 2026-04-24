<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#if data.empty}
	<div class="rounded-lg border border-dashed border-neutral-800 bg-neutral-900 px-6 py-16 text-center">
		<h3 class="m-0 text-base font-semibold text-white">This repository is empty</h3>
		<p class="mx-auto mt-2 max-w-md text-sm text-neutral-400">
			Nothing has been pushed yet. Clone the URL above and run
			<span class="font-mono text-neutral-300">git push</span>
			to seed your first commit.
		</p>
	</div>
{/if}
