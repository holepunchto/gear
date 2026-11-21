<script lang="ts">
	import { getContext } from 'svelte';
	import { assetUrl, type Base } from '$lib/markdown';

	// A markdown image, with a repo-relative path loaded from the repo.
	const {
		href = '',
		title,
		text = ''
	}: { href?: string; title?: string; text?: string } = $props();

	const base = getContext<() => Base>('markdown-base');
	const src = $derived(assetUrl(base(), href));
</script>

{#if src}
	<img {src} {title} alt={text} loading="lazy" />
{/if}
