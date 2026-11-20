<script lang="ts">
	import type { PageProps } from './$types';
	import ProposeForm from '$lib/components/releases/ProposeForm.svelte';

	// Step 0 of a release: pick or make its tag, then on to its flow page.
	let { data }: PageProps = $props();

	const key = $derived(data.key);
	const back = $derived(key.repo ? `/${key.repo.name}/releases` : `/releases/${key.key}`);
	const current = $derived(key.pending.find((p) => p.mine) ?? null);
</script>

<svelte:head>
	<title>Release a new version · {key.name} · Gear</title>
</svelte:head>

<main class="relative mx-auto flex max-w-[600px] flex-col gap-6 px-[18px] pt-3 pb-24 sm:pt-8">
	<header class="flex items-center gap-2.5">
		<a
			href={back}
			aria-label="Close"
			class="-ml-2.5 flex h-11 w-11 items-center justify-center text-fg no-underline"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg
			>
		</a>
		<a
			href="/releases/{key.key}"
			class="flex-1 truncate text-center font-mono text-xs text-fg-3 no-underline hover:text-accent-300"
		>
			{key.name}
		</a>
		<span class="w-11" aria-hidden="true"></span>
	</header>

	{#if current}
		<p class="m-0 rounded-2xl bg-surface px-5 py-4 text-sm text-fg-2 ring-1 ring-line ring-inset">
			<a href="/releases/{key.key}/{current.id}" class="font-semibold">
				{current.release?.name ?? 'A release'}
			</a>
			is still in progress. Finish or withdraw it before releasing another version.
		</p>
	{:else}
		<ProposeForm {key} candidates={data.candidates} />
	{/if}
</main>
