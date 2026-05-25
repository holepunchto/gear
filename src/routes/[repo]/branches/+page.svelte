<script lang="ts">
	import type { LayoutData } from '../$types';
	import RefList from '$lib/components/RefList.svelte';

	// Branches come from the [repo] layout load — no page load needed.
	let { data }: { data: LayoutData } = $props();
</script>

<RefList
	refs={data.repo.branches}
	repoName={data.repo.name}
	headName={data.repo.head}
	kind="branch"
	emptyTitle="No branches"
	emptyHint="This repository has no branches yet. Push a ref to see it here."
/>
