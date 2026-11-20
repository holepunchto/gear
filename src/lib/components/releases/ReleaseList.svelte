<script lang="ts">
	import ReleaseSeal from './ReleaseSeal.svelte';
	import {
		proposalHref,
		proposalName,
		releaseProgress,
		repoReleaseHref,
		type KeySummary,
		type Release
	} from '$lib/releases';
	import { relativeTime, isoDate } from '$lib/time';

	// A repo's releases, like its tags: the ones in progress first, then
	// every signed one, newest first, in the order of `keys`. With more than
	// one key, each row says which it is on. `latest` is the repo's current
	// release.
	let {
		repo,
		keys,
		latest
	}: {
		repo: string;
		keys: { key: KeySummary; history: Release[] }[];
		latest: { key: string; tag: string | null } | null;
	} = $props();

	const several = $derived(keys.length > 1);
	const pending = $derived(
		keys.flatMap(({ key }) => (key.revoked ? [] : key.pending.map((p) => ({ key, p }))))
	);
	const signed = $derived(keys.flatMap(({ key, history }) => history.map((r) => ({ key, r }))));
	const arriving = $derived(keys.some(({ key }) => key.arriving));
</script>

{#if pending.length === 0 && signed.length === 0}
	<div class="rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-line ring-inset">
		<h3 class="m-0 text-base font-semibold text-white">No releases yet</h3>
		<p class="mx-auto mt-1.5 max-w-md text-sm text-neutral-400">
			{arriving
				? 'The signed repo is still arriving.'
				: 'Release a tag to sign it. Signed releases appear here.'}
		</p>
	</div>
{:else}
	<div class="overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
		<ul class="m-0 list-none p-0">
			{#each pending as { key, p } (p.id)}
				{@const progress = releaseProgress(key, p)}
				<li
					class="relative grid grid-cols-[1fr_auto] items-center gap-4 border-b border-white/[0.035] bg-apricot-400/5 px-3.5 py-3.5 transition-colors last:border-b-0 hover:bg-apricot-400/8 sm:px-[18px]"
				>
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<span class="h-2 w-2 animate-pulse rounded-full bg-apricot-400" aria-hidden="true"
							></span>
							<a
								href={proposalHref(key, p)}
								class="font-display text-[17px] font-semibold text-apricot-300 no-underline before:absolute before:inset-0"
							>
								{proposalName(p)}
							</a>
							<span
								class="rounded-full bg-apricot-400/12 px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] text-apricot-300 uppercase"
							>
								In progress
							</span>
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-apricot-300/80">
							<span>step {progress.step} of {progress.steps} · {progress.text}</span>
							{#if several}
								<span aria-hidden="true">·</span>
								<span class="font-mono text-fg-3">{key.name}</span>
							{/if}
						</div>
					</div>
					<span class="text-[13px] font-semibold text-apricot-300">Continue →</span>
				</li>
			{/each}
			{#each signed as { key, r } (key.key + r.tag)}
				{@const current = latest?.key === key.key && latest.tag === r.tag}
				<li
					class="relative grid grid-cols-[1fr_auto] items-center gap-4 border-b border-white/[0.035] px-3.5 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2 sm:px-[18px]"
				>
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<a
								href={repoReleaseHref(repo, r.tag, several ? key.key : undefined)}
								class="font-display text-[17px] font-semibold no-underline before:absolute before:inset-0 {key.revoked
									? 'text-fg-2'
									: 'text-seal-100'}"
							>
								{r.name}
							</a>
							{#if current}
								<span
									class="rounded-full bg-seal-500/18 px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] text-seal-200 uppercase"
								>
									Latest
								</span>
							{/if}
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
							<span class="font-mono">{r.tag}</span>
							<span aria-hidden="true">·</span>
							<span class="font-mono" title={r.commit}>{r.commit.slice(0, 7)}</span>
							{#if r.timestamp}
								<span aria-hidden="true">·</span>
								<span title={isoDate(r.timestamp)}>{relativeTime(r.timestamp)}</span>
							{/if}
							{#if several}
								<span aria-hidden="true">·</span>
								<span class="font-mono">{key.name}</span>
							{/if}
						</div>
					</div>
					{#if key.revoked}
						<span
							class="rounded-full bg-red-500/14 px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] text-red-300 uppercase"
						>
							Revoked
						</span>
					{:else}
						<ReleaseSeal quorum={key.quorum} signers={key.signers.length} />
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
