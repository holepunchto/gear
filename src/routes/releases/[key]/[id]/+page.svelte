<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';
	import ReleaseFlow from '$lib/components/releases/ReleaseFlow.svelte';
	import { liveReleases } from '$lib/releases';

	// A release in progress whose repo isn't here: its flow on the key.
	let { data, form }: PageProps = $props();

	onMount(liveReleases);
</script>

<main class="relative mx-auto flex max-w-[600px] flex-col gap-6 px-[18px] pt-3 pb-24 sm:pt-8">
	<ReleaseFlow {data} {form} />
</main>
