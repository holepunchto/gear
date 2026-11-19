<script lang="ts">
	import { enhance } from '$app/forms';
	import type { KeySummary } from '$lib/releases';

	// Archive a key, or unarchive it. Archiving is local: the key keeps being
	// seeded, so co-signers and followers lose nothing. Posts to the key
	// page's actions, so it works from any page.
	let { key }: { key: KeySummary } = $props();

	let confirming = $state(false);
	let busy = $state(false);

	const pending = $derived(key.pending[0] ?? null);
	const where = $derived(key.repo ? `${key.repo.name}'s Releases tab` : 'its repo');

	function submit() {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
			confirming = false;
		};
	}
</script>

{#if key.archived}
	<form
		method="POST"
		action="/releases/{key.key}?/unarchive"
		use:enhance={submit}
		class="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-5 py-4 ring-1 ring-line ring-inset"
	>
		<span class="min-w-0 flex-[1_1_260px] text-sm text-fg-2">
			<b class="font-semibold text-fg">Archived on this device.</b>
			Its history stays browsable here and Gear keeps seeding it.
		</span>
		<button
			type="submit"
			disabled={busy}
			class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 disabled:opacity-60 sm:h-9"
		>
			{busy ? 'Unarchiving…' : 'Unarchive'}
		</button>
	</form>
{:else}
	<details class="group rounded-xl bg-surface ring-1 ring-line ring-inset">
		<summary
			class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-fg-2 hover:text-fg"
		>
			Move away from this key
			<span class="text-xs font-normal text-fg-3 group-open:hidden">archive</span>
		</summary>
		<div class="flex flex-col gap-3 px-4 pb-4">
			<div class="flex flex-wrap items-start gap-3">
				<div class="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
					<span class="text-sm font-semibold text-fg">Archive</span>
					<span class="text-xs leading-normal text-fg-3">
						Hides <span class="font-mono">{key.name}</span> from {where}, its badges and Your
						releases on this device. Its history stays under Archived on Release keys, and you can
						unarchive it any time.
					</span>
				</div>
				{#if !confirming}
					<button
						type="button"
						onclick={() => (confirming = true)}
						class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-surface-4 px-4 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3 sm:h-9"
					>
						Archive…
					</button>
				{/if}
			</div>

			{#if confirming}
				<form
					method="POST"
					action="/releases/{key.key}?/archive"
					use:enhance={submit}
					class="flex flex-col gap-3 rounded-xl bg-bg p-4 ring-1 ring-line-strong ring-inset"
				>
					<p class="m-0 text-sm leading-normal text-fg-2">
						{#if key.role === 'follower'}
							Gear keeps seeding <span class="font-mono">{key.name}</span>, so other followers can
							still read it. Nothing changes for its signers.
						{:else}
							Gear keeps seeding <span class="font-mono">{key.name}</span>, so co-signers and
							followers lose nothing.
							{key.length ? 'Its releases stay published.' : 'Nothing has been released on it yet.'}
							You can't propose from it while it's archived.
						{/if}
					</p>
					{#if pending}
						<p class="m-0 text-sm leading-normal text-apricot-300" role="alert">
							{pending.release?.name ?? 'A release'} is still collecting signatures. Archiving doesn't
							withdraw it: co-signers can still sign it, and anyone holding enough signatures can still
							commit it.
						</p>
					{/if}
					<div class="flex flex-wrap gap-2.5">
						<button
							type="submit"
							disabled={busy}
							class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] bg-apricot-400 px-4 text-sm font-semibold text-[#2a1405] hover:bg-apricot-300 disabled:opacity-60 sm:h-9"
						>
							{busy ? 'Archiving…' : `Archive ${key.name}`}
						</button>
						<button
							type="button"
							onclick={() => (confirming = false)}
							class="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] px-4 text-sm font-medium text-fg-2 hover:text-fg sm:h-9"
						>
							Cancel
						</button>
					</div>
				</form>
			{/if}
		</div>
	</details>
{/if}
