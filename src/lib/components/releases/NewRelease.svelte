<script lang="ts">
	// Starts releasing a new version on `key`: picking its tag is a page of
	// its own, which goes on to the release's flow page.
	let { key }: { key: string } = $props();
</script>

<a
	href="/releases/{key}/new"
	class="inline-flex h-11 items-center gap-2 self-start rounded-xl bg-accent-400 px-5 text-sm font-semibold text-accent-900 no-underline shadow-[0_8px_28px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300"
>
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2.4"
		stroke-linecap="round"
		aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
	>
	Release a new version
</a>
