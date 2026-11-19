<script lang="ts">
	import type { RepoRelease } from '$lib/releases';

	// The compact release line on library and discover cards. Apricot while
	// something is pending, mint otherwise.
	let { release }: { release: RepoRelease } = $props();
</script>

<span
	class="truncate font-mono text-xs font-medium {release.pending
		? 'text-apricot-300'
		: 'text-accent-300'}"
	title={release.name}
>
	◆ {release.version ?? 'no release yet'} · {release.quorum}/{release.signers}{release.version
		? ' signed'
		: ''}{release.pending?.waitingOnMe ? ' · needs you' : ''}
</span>
