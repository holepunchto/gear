<script lang="ts">
	import SeatDots from './SeatDots.svelte';
	import { multisig, proposalName, type KeySummary } from '$lib/releases';

	let { keys }: { keys: KeySummary[] } = $props();

	// What each key is waiting on, from this device's point of view.
	function state(k: KeySummary) {
		const p = k.pending[0];
		const amSigner = k.signers.some((s) => s.me);
		if (p && !p.signedByMe && amSigner) {
			return {
				kind: 'you',
				href: `/releases/${k.key}/${p.id}`,
				version: proposalName(p, k.latest?.name ?? '—'),
				filled: p.mine ? p.signed.length : 0,
				status: 'Waiting on your signature'
			};
		}
		if (p) {
			return {
				kind: 'collecting',
				href: `/releases/${k.key}`,
				version: proposalName(p, k.latest?.name ?? '—'),
				filled: p.signed.length,
				status: p.mine
					? `Collecting · ${p.signed.length} of ${k.quorum} in`
					: 'You signed · waiting on a commit'
			};
		}
		return {
			kind: 'done',
			href: `/releases/${k.key}`,
			version: k.latest?.name ?? '—',
			filled: k.latest ? k.quorum : 0,
			status: k.latest
				? `Released · ${k.released} ${k.released === 1 ? 'tag' : 'tags'} signed`
				: 'No releases yet'
		};
	}

	const rows = $derived(keys.map((k) => ({ k, s: state(k) })));
	const waiting = $derived(rows.filter((r) => r.s.kind === 'you').length);
	const collecting = $derived(rows.filter((r) => r.s.kind === 'collecting').length);
</script>

<section aria-label="Your releases" class="flex flex-col gap-3.5">
	<div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
		<h2 class="m-0 text-xl font-semibold tracking-[-0.01em] text-fg">Your releases</h2>
		{#if waiting || collecting}
			<span class="text-[13px] font-medium text-apricot-300">
				{[waiting && `${waiting} waiting on you`, collecting && `${collecting} collecting`]
					.filter(Boolean)
					.join(' · ')}
			</span>
		{/if}
		<a href="/releases" class="ml-auto text-[13px] font-medium no-underline">All release keys →</a>
	</div>
	<ul
		class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3 p-0"
	>
		{#each rows as { k, s } (k.key)}
			{@const sealed = s.kind === 'done' && !!k.latest}
			<li>
				<a
					href={s.href}
					class="flex h-full flex-col gap-2.5 rounded-2xl p-4 text-fg no-underline ring-1 transition-colors ring-inset {s.kind ===
					'you'
						? 'bg-linear-170 from-[#1a140d] to-[#0f0d09] shadow-[0_0_30px_rgb(251_146_60/0.08)] ring-apricot-400/35'
						: sealed && multisig(k.signers.length)
							? 'bg-surface shadow-glow-seal ring-seal-400/30 hover:bg-surface-2'
							: 'bg-surface ring-line hover:bg-surface-2'}"
				>
					<div class="flex items-baseline gap-2.5">
						<span class="min-w-0 flex-1 truncate font-mono text-xs font-medium text-fg-2">
							{k.name}
						</span>
						<span
							class="rounded-full px-[7px] py-px text-[10px] font-semibold tracking-[0.08em] uppercase {k.owner
								? 'bg-accent-400/12 text-accent-300'
								: 'bg-white/6 text-fg-2'}"
						>
							{k.owner ? 'Owner' : 'Signer'}
						</span>
					</div>
					<div class="flex items-center gap-3">
						<span class="font-display text-[26px] font-semibold tracking-[-0.02em]"
							>{s.version}</span
						>
						<SeatDots n={k.signers.length} filled={s.filled} size={9} seal={sealed} />
					</div>
					<span class="text-xs font-medium {s.kind === 'done' ? 'text-fg-3' : 'text-apricot-300'}">
						{s.status}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</section>
