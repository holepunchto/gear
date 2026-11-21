<script lang="ts">
	import SvelteMarkdown from '@humanspeak/svelte-markdown';
	import { parseDocument } from 'htmlparser2';
	import { setContext } from 'svelte';
	import Code from './Code.svelte';
	import MarkdownImage from './MarkdownImage.svelte';
	import MarkdownTable from './MarkdownTable.svelte';
	import HtmlNodes from './HtmlNodes.svelte';
	import { segments, type Base } from '$lib/markdown';

	// A repo's markdown: markdown runs through the renderer, block HTML through
	// HtmlNodes, and relative paths resolve against `base`.
	const { source, base }: { source: string; base: Base } = $props();

	setContext('markdown-base', () => base);

	const parts = $derived(segments(source));
</script>

{#each parts as part, i (i)}
	{#if part.kind === 'html'}
		<HtmlNodes nodes={parseDocument(part.source).children} {base} />
	{:else}
		<SvelteMarkdown
			source={part.source}
			renderers={{ code: Code, image: MarkdownImage, table: MarkdownTable }}
		/>
	{/if}
{/each}
