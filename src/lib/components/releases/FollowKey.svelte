<script lang="ts">
	import { enhance } from '$app/forms';

	// Paste a release key or share link to follow it, read-only. `action` is
	// the form action that calls the release service's follow().
	let { action, error = null }: { action: string; error?: string | null } = $props();

	let following = $state(false);
</script>

<section
	aria-label="Follow a release key"
	class="flex flex-col gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line ring-inset"
>
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="m-0 text-base font-semibold text-fg">Follow a release key</h2>
		<span class="text-xs text-fg-3">
			Someone shares a key or a share link. Following it shows its releases here, read-only.
		</span>
	</div>
	<form
		method="POST"
		{action}
		class="flex flex-col gap-2 sm:flex-row"
		use:enhance={() => {
			following = true;
			return async ({ update }) => {
				await update();
				following = false;
			};
		}}
	>
		<label class="sr-only" for="follow-key">Release key or share link</label>
		<input
			id="follow-key"
			name="key"
			required
			autocomplete="off"
			spellcheck="false"
			placeholder="git+pear://…?release=… or a release key"
			class="min-w-0 flex-1 rounded-[10px] border-0 bg-bg px-3 py-2.5 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
		/>
		<button
			type="submit"
			disabled={following}
			class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong transition-colors ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-auto"
		>
			{following ? 'Finding it…' : 'Follow'}
		</button>
	</form>
	{#if error}
		<p class="m-0 text-xs text-red-400" role="alert">{error}</p>
	{/if}
</section>
