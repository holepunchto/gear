<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submittingAdd = $state(false);
	let copied = $state(false);

	// Live network stats — initial SSR snapshot gets replaced by /api/events.
	let stats = $state({ ...data.stats });

	onMount(() => {
		const es = new EventSource('/api/events');
		es.addEventListener('stats', (e) => {
			try {
				const s = JSON.parse((e as MessageEvent).data);
				stats = {
					connections: typeof s.peers === 'number' ? s.peers : stats.connections,
					dhtNodes: typeof s.dhtNodes === 'number' ? s.dhtNodes : stats.dhtNodes
				};
			} catch {
				// malformed payload — drop it
			}
		});
		return () => es.close();
	});

	const addPeerError = $derived(
		form?.addPeer && 'error' in form.addPeer ? form.addPeer : null
	);

	async function copyIdentity() {
		try {
			await navigator.clipboard.writeText(data.identity);
			copied = true;
			setTimeout(() => (copied = false), 1200);
		} catch {}
	}

	function shortPeer(key: string) {
		return key.slice(0, 8) + '…' + key.slice(-6);
	}
</script>

<svelte:head>
	<title>Settings · Gear</title>
</svelte:head>

<main class="mx-auto max-w-[900px] px-4 pt-6 pb-20 sm:px-6 sm:pt-8">
	<header class="mb-6">
		<h1 class="m-0 text-xl font-semibold tracking-tight text-white sm:text-[22px]">Settings</h1>
		<p class="mt-1 text-sm text-neutral-400">
			Manage your peer identity, network, and the blind peers that seed your repos.
		</p>
	</header>

	<!-- IDENTITY -->
	<section class="mb-5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
		<div class="border-b border-neutral-800 px-5 py-3.5">
			<h2 class="m-0 text-[15px] font-semibold text-white">Identity</h2>
			<p class="m-0 mt-0.5 text-xs text-neutral-400">
				The public key shared with peers when you connect.
			</p>
		</div>
		<div class="px-5 py-5">
			<div class="grid grid-cols-1 items-start gap-2 sm:grid-cols-[140px_1fr_auto] sm:gap-3">
				<label for="identity" class="text-xs font-medium text-neutral-400 sm:pt-2">
					Public key
				</label>
				<code
					id="identity"
					class="min-w-0 break-all rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[12.5px] text-neutral-100"
				>
					{data.identity}
				</code>
				<button
					type="button"
					onclick={copyIdentity}
					class="justify-self-start rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-700 sm:justify-self-auto"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>
	</section>

	<!-- NETWORK STATS -->
	<section class="mb-5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
		<div class="border-b border-neutral-800 px-5 py-3.5">
			<h2 class="m-0 text-[15px] font-semibold text-white">Network</h2>
			<p class="m-0 mt-0.5 text-xs text-neutral-400">
				Live Hyperswarm connectivity for this process.
			</p>
		</div>
		<div class="grid grid-cols-2 gap-5 px-5 py-5">
			<div>
				<div class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
					Active connections
				</div>
				<div class="mt-1 text-2xl font-semibold text-white tabular-nums">
					{stats.connections}
				</div>
			</div>
			<div>
				<div class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
					DHT nodes
				</div>
				<div class="mt-1 text-2xl font-semibold text-white tabular-nums">
					{stats.dhtNodes}
				</div>
			</div>
		</div>
	</section>

	<!-- BLIND PEERS -->
	<section class="mb-5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
		<div class="border-b border-neutral-800 px-5 py-3.5">
			<h2 class="m-0 text-[15px] font-semibold text-white">Blind peers</h2>
			<p class="m-0 mt-0.5 text-xs text-neutral-400">
				Always-on seeders that replicate your cores in the background.
			</p>
		</div>
		<div class="px-5 py-5">
			{#if data.blindPeers.length === 0}
				<p class="m-0 text-sm text-neutral-500">
					No blind peers configured. Add one below to keep your repos online even when Gear isn't running.
				</p>
			{:else}
				<ul class="m-0 list-none p-0">
					{#each data.blindPeers as peer (peer)}
						<li
							class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-neutral-800 py-3 last:border-b-0"
						>
							<div class="min-w-0">
								<div class="font-mono text-[12.5px] text-white" title={peer}>
									{shortPeer(peer)}
								</div>
								<div class="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
									Seeder
								</div>
							</div>
							<form method="POST" action="?/removePeer" use:enhance>
								<input type="hidden" name="peerKey" value={peer} />
								<button
									type="submit"
									class="rounded-md border border-neutral-800 bg-transparent px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:border-red-900/60 hover:bg-red-950/30"
								>
									Remove
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}

			<form
				method="POST"
				action="?/addPeer"
				use:enhance={() => {
					submittingAdd = true;
					return async ({ update }) => {
						await update();
						submittingAdd = false;
					};
				}}
				class="mt-4 grid grid-cols-1 gap-2 border-t border-neutral-800 pt-4 sm:grid-cols-[1fr_auto]"
			>
				<input
					type="text"
					name="peerKey"
					placeholder="z32-encoded public key of a blind peer"
					autocomplete="off"
					required
					value={addPeerError?.value ?? ''}
					class="min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[12.5px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:outline-none focus:ring-4 focus:ring-accent-500/20"
				/>
				<button
					type="submit"
					disabled={submittingAdd}
					class="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-accent-900 hover:bg-accent-400 disabled:opacity-60"
				>
					{submittingAdd ? 'Adding…' : 'Add peer'}
				</button>
				{#if addPeerError}
					<p class="m-0 text-sm text-red-400 sm:col-span-2">{addPeerError.error}</p>
				{/if}
			</form>
		</div>
	</section>
</main>
