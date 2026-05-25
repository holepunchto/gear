<script lang="ts">
	import type { LayoutData } from '../$types';
	import RefList from '$lib/components/RefList.svelte';

	let { data }: { data: LayoutData } = $props();
</script>

<RefList
	refs={data.repo.tags}
	repoName={data.repo.name}
	kind="tag"
	emptyTitle="No tags"
	emptyHint="Tag a commit to mark it as a release. Tags appear here once they're pushed."
/>
