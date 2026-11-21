<script lang="ts">
	import type { ChildNode, Element } from 'domhandler';
	import HtmlNodes from './HtmlNodes.svelte';
	import {
		ALLOWED_TAGS,
		DROPPED_TAGS,
		VOID_TAGS,
		assetUrl,
		linkUrl,
		srcset,
		type Base
	} from '$lib/markdown';

	const { nodes, base }: { nodes: ChildNode[]; base: Base } = $props();

	const PLAIN = [
		'alt',
		'title',
		'width',
		'height',
		'colspan',
		'rowspan',
		'start',
		'open',
		'media',
		'type'
	];

	// Only these attributes survive, with every URL checked and repo paths made
	// absolute. `align`, common in READMEs, becomes text-align.
	function attributes(el: Element) {
		const out: Record<string, string> = {};
		for (const [name, value] of Object.entries(el.attribs)) {
			if (PLAIN.includes(name)) out[name] = value;
		}
		const { href, src, srcset: set, align } = el.attribs;
		if (el.name === 'a' && href) {
			const url = linkUrl(base, href);
			if (url) out.href = url;
		}
		if (el.name === 'img' && src) {
			const url = assetUrl(base, src);
			if (url) out.src = url;
		}
		if ((el.name === 'img' || el.name === 'source') && set) {
			const value = srcset(base, set);
			if (value) out.srcset = value;
		}
		if (align && /^(left|center|right)$/i.test(align)) {
			out.style = `text-align: ${align.toLowerCase()}`;
		}
		return out;
	}
</script>

{#each nodes as node, i (i)}
	{#if node.type === 'text'}
		{node.data}
	{:else if node.type === 'tag' && !DROPPED_TAGS.has(node.name)}
		{#if !ALLOWED_TAGS.has(node.name)}
			<HtmlNodes nodes={node.children} {base} />
		{:else if VOID_TAGS.has(node.name)}
			<svelte:element this={node.name} {...attributes(node)} />
		{:else}
			<svelte:element this={node.name} {...attributes(node)}>
				<HtmlNodes nodes={node.children} {base} />
			</svelte:element>
		{/if}
	{/if}
{/each}
