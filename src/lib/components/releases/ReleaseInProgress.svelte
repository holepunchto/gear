<script lang="ts">
	import {
		proposalHref,
		proposalName,
		releaseProgress,
		type KeySummary,
		type Pending
	} from '$lib/releases';

	// A release under way, as one line that opens its flow.
	let { key, current }: { key: KeySummary; current: Pending } = $props();

	const progress = $derived(releaseProgress(key, current));
</script>

<a
	href={proposalHref(key, current)}
	class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-linear-170 from-[#1a140d] to-[#0f0d09] px-5 py-4 text-fg no-underline ring-1 ring-apricot-400/35 transition-colors ring-inset hover:ring-apricot-400/60"
>
	<span class="h-2 w-2 animate-pulse rounded-full bg-apricot-400" aria-hidden="true"></span>
	<b class="font-display text-lg font-semibold text-apricot-300">{proposalName(current)}</b>
	<span class="text-[13px] text-fg-2">
		step {progress.step} of {progress.steps} · {progress.text}
	</span>
	<span class="ml-auto text-[13px] font-semibold text-apricot-300">Continue →</span>
</a>
