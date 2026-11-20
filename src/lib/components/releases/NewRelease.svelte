<script lang="ts">
	// Starts releasing a new version on `key`: on the Releases tab of its
	// repo, which opens New release on it.
	let { key, repo }: { key: string; repo: string } = $props();
</script>

<a
	href="/{repo}/releases?new={key}"
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
