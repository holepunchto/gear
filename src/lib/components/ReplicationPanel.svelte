<script lang="ts">
	import PeerConstellation from './PeerConstellation.svelte';
	import Ticker from './Ticker.svelte';
	import { ago } from '$lib/time';

	type Range = { from: number; to: number };

	let {
		length,
		contiguous,
		held,
		buckets,
		peers,
		writable,
		fresh,
		last,
		now
	}: {
		length: number;
		contiguous: number;
		// Blocks held with gaps, for the count: a sync fills them out of order.
		held: number;
		// Percent held of each of 64 slices of the whole core while blocks are
		// missing; the strip shows those instead of the newest blocks.
		buckets: number[] | null;
		peers: number;
		writable: boolean;
		// Block ranges that arrived in the last moment — their cells flash.
		fresh: Range[];
		// The latest append this session, for the status line.
		last: { added: number; at: number } | null;
		now: number;
	} = $props();

	const CELLS = 64;

	// A sync fetches blocks in random order, so every slice changes on every
	// update. Only a slice that just became fully held flashes; the rest show
	// progress through their fill.
	let filled = $state.raw<Set<number>>(new Set());
	let prevBuckets: number[] | null = null;
	$effect(() => {
		const prev = prevBuckets;
		prevBuckets = buckets;
		if (!buckets || !prev) return;
		const changed = new Set<number>();
		buckets.forEach((pct, i) => pct >= 100 && prev[i] < 100 && changed.add(i));
		filled = changed;
		const t = setTimeout(() => (filled = new Set()), 1600);
		return () => clearTimeout(t);
	});

	const cells = $derived.by(() => {
		if (buckets) {
			return buckets.map((pct, i) => ({
				b: i,
				state: pct >= 100 ? 'held' : pct > 0 ? 'partial' : 'remote',
				pct,
				fresh: filled.has(i)
			}));
		}
		const start = Math.max(0, length - CELLS);
		return Array.from({ length: CELLS }, (_, i) => {
			const b = start + i;
			return {
				b,
				state: b >= length ? 'none' : b >= contiguous ? 'remote' : 'held',
				pct: 0,
				fresh: fresh.some((r) => b >= r.from && b < r.to)
			};
		});
	});

	const syncing = $derived(contiguous < length);
	// Nothing known about the repo yet: no count to show, the strip scans instead.
	const waiting = $derived(length === 0 && !writable);
	// Nothing replicated or pushed yet, so there is nothing to be in sync with.
	const status = $derived(
		length === 0 ? (writable ? 'Empty' : 'Waiting for peers') : syncing ? 'Syncing' : 'In sync'
	);
</script>

<section
	aria-label="Replication"
	class="mb-7 flex flex-wrap overflow-hidden rounded-2xl bg-linear-to-b from-surface-2 to-[#0b120e] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),0_20px_60px_rgb(0_0_0/0.35)]"
>
	<div
		class="flex min-w-0 flex-[1_1_560px] flex-col justify-center gap-3 p-3.5 sm:gap-3.5 sm:px-6 sm:py-[22px]"
	>
		<div class="flex flex-wrap items-baseline justify-between gap-3 text-xs sm:text-sm">
			<div class="flex min-w-0 items-center gap-2 sm:gap-2.5">
				<span
					aria-hidden="true"
					class="h-2 w-2 shrink-0 self-center rounded-full {syncing
						? 'bg-apricot-400 shadow-[0_0_10px_#fb923c]'
						: peers > 0
							? 'bg-accent-400 shadow-glow-strong'
							: 'bg-neutral-600'}"
				></span>
				<span class="font-semibold text-fg">{status}</span>
				<span class="truncate text-fg-3">
					{#if last}
						· {last.added} block{last.added === 1 ? '' : 's'} arrived {ago(last.at, now)}
					{:else if peers === 0}
						· no peers connected
					{/if}
				</span>
			</div>
			{#if length > 0}
				<span class="font-mono text-xs text-fg-2 sm:text-[13px]">
					<b class="font-medium text-fg"><Ticker value={held} /></b> / {length.toLocaleString()}
					blocks
				</span>
			{/if}
		</div>

		<div
			role="img"
			aria-label={waiting
				? 'Looking for peers that have this repo'
				: buckets
					? `Whole repo: ${held} of ${length} blocks held locally`
					: `Newest blocks: ${Math.min(contiguous, length)} of ${length} held locally`}
			class="grid grid-cols-[repeat(32,minmax(0,1fr))] gap-0.5 sm:grid-cols-[repeat(64,minmax(0,1fr))] sm:gap-[3px]"
		>
			{#each cells as c, i (c.b)}
				<span
					class="h-3 rounded-[2px] sm:h-3.5 sm:rounded-[3px] {i < CELLS / 2 ? 'max-sm:hidden' : ''}
					{c.state === 'held'
						? 'bg-accent-400/60'
						: c.state === 'remote'
							? 'bg-neutral-800'
							: c.state === 'partial'
								? ''
								: 'bg-white/[0.025]'}
					{c.fresh ? 'animate-arrive bg-accent-400' : ''}
					{waiting ? 'scan' : ''}"
					style:background-color={c.state === 'partial' && !c.fresh
						? `color-mix(in srgb, rgb(35 204 148 / 0.6) ${c.pct}%, var(--color-neutral-800))`
						: undefined}
					style:animation-delay={waiting ? `${i * 22}ms` : undefined}
				></span>
			{/each}
		</div>

		<div class="hidden flex-wrap gap-[18px] text-xs text-fg-3 {length > 0 ? 'sm:flex' : ''}">
			<span class="flex items-center gap-1.5">
				<span aria-hidden="true" class="h-2.5 w-2.5 rounded-[3px] bg-accent-400/60"></span>Held
				locally
			</span>
			<span class="flex items-center gap-1.5">
				<span
					aria-hidden="true"
					class="h-2.5 w-2.5 rounded-[3px] bg-accent-100 shadow-[0_0_8px_#23cc94]"
				></span>Just arrived
			</span>
			<span class="flex items-center gap-1.5">
				<span aria-hidden="true" class="h-2.5 w-2.5 rounded-[3px] bg-neutral-800"></span>Remote only
			</span>
		</div>
	</div>

	<div
		class="hidden min-w-[280px] flex-[0_1_380px] items-center gap-5 border-l border-line px-6 py-[22px] sm:flex"
	>
		<PeerConstellation
			{peers}
			label="You and {peers} peer{peers === 1 ? '' : 's'} replicating this repo"
		/>
		<div class="flex flex-col gap-2 text-[13px] text-fg-2">
			<span>
				<b class="font-display text-xl font-semibold text-fg"><Ticker value={peers} /></b>
				peer{peers === 1 ? '' : 's'} on this repo
			</span>
			<span>{writable ? 'You are the writer' : 'Read-only copy'}</span>
		</div>
	</div>
</section>

<style>
	.scan {
		animation: scan 2.4s ease-in-out infinite;
	}

	@keyframes scan {
		0%,
		40%,
		100% {
			background-color: rgb(255 255 255 / 0.025);
			box-shadow: none;
		}
		12% {
			background-color: rgb(35 204 148 / 0.45);
			box-shadow: 0 0 8px rgb(35 204 148 / 0.5);
		}
	}
</style>
