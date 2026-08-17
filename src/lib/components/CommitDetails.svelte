<script lang="ts">
	import type { ParsedCommit } from '$lib/server/commit-parse';
	import CommitBody from './CommitBody.svelte';

	let { parsed }: { parsed: ParsedCommit } = $props();

</script>

{#if parsed.body}
	<details class="mt-2 text-[12.5px] text-neutral-400">
		<summary
			class="inline-flex cursor-pointer list-none items-center gap-1 text-neutral-500 hover:text-neutral-300"
		>
			<svg
				width="11"
				height="11"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="transition-transform [details[open]_&]:rotate-90"
				aria-hidden="true"
			>
				<path d="m9 18 6-6-6-6" />
			</svg>
			<span class="select-none">Show more</span>
		</summary>
		<div class="mt-2 space-y-3 border-l-2 border-neutral-800 pl-3">
			<CommitBody {parsed} />
		</div>
	</details>
{/if}
