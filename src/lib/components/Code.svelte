<script lang="ts">
	import { highlight } from '$lib/highlight';

	interface Props {
		lang: string;
		text: string;
	}
	const { lang, text }: Props = $props();

	const html = $derived(highlight(text, lang));
</script>

{#if html !== null}
	<pre><code>{@html html}</code></pre>
{:else}
	<pre><code>{text}</code></pre>
{/if}
