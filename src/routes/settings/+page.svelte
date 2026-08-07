<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, tick } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submittingAdd = $state(false);
	let copied = $state(false);
	let installing = $state(false);
	let copiedCommand = $state(false);

	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(data.installCommand);
			copiedCommand = true;
			setTimeout(() => (copiedCommand = false), 1200);
		} catch {}
	}

	// Optimistic mirror of the toggle. We flip it on click, let Svelte update
	// the hidden input, and only then submit the form — that way the form
	// data sent to the server reflects the new desired state.
	let seedReadOnly = $state<boolean>(data.seedReadOnly);
	let seedForm: HTMLFormElement;

	async function toggleSeedReadOnly() {
		seedReadOnly = !seedReadOnly;
		await tick(); // ensure the hidden input reflects the new value
		seedForm.requestSubmit();
	}

	// Live network stats — initial SSR snapshot gets replaced by /api/events.
	let stats = $state({ ...data.stats });

	onMount(() => {
		const es = new EventSource('/api/events');
		es.addEventListener('stats', (e) => {
			try {
				const s = JSON.parse((e as MessageEvent).data);
				stats = {
					...stats,
					connections: typeof s.peers === 'number' ? s.peers : stats.connections,
					dhtNodes: typeof s.dhtNodes === 'number' ? s.dhtNodes : stats.dhtNodes
				};
			} catch {
				// malformed payload — drop it
			}
		});
		return () => es.close();
	});

	const addPeerError = $derived(form?.addPeer && 'error' in form.addPeer ? form.addPeer : null);

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
					class="min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[12.5px] break-all text-neutral-100"
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

	<!-- COMMAND LINE -->
	{#if data.cli}
		<section class="mb-5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
			<div class="border-b border-neutral-800 px-5 py-3.5">
				<h2 class="m-0 text-[15px] font-semibold text-white">Command line</h2>
				<p class="m-0 mt-0.5 text-xs text-neutral-400">
					The <code class="font-mono text-neutral-300">gip</code> CLI and git remote helper —
					required to <code class="font-mono text-neutral-300">git clone</code> the
					<code class="font-mono text-neutral-300">git+pear://</code> urls Gear hands out.
				</p>
			</div>
			<div class="px-5 py-5">
				{#if data.cli.installed}
					<div class="flex items-center gap-2.5">
						<span
							class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-500/15 text-accent-400"
						>
							<svg
								width="11"
								height="11"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M5 13l4 4L19 7" />
							</svg>
						</span>
						<div class="min-w-0">
							<div class="text-sm font-medium text-white">Installed</div>
							{#if data.cli.path}
								<div class="mt-0.5 truncate font-mono text-[11.5px] text-neutral-500">
									{data.cli.path}
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div class="min-w-0">
							<div class="text-sm font-medium text-white">Not installed</div>
							<p class="mt-1 text-xs text-neutral-400">
								Installs <code class="font-mono">gip-transport</code> globally via npm.
							</p>
						</div>
						{#if data.cli.npm}
							<form
								method="POST"
								action="?/installCli"
								use:enhance={() => {
									installing = true;
									return async ({ update }) => {
										await update();
										installing = false;
									};
								}}
							>
								<button
									type="submit"
									disabled={installing}
									class="inline-flex items-center justify-center rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-accent-900 hover:bg-accent-400 disabled:opacity-60"
								>
									{installing ? 'Installing…' : 'Install CLI'}
								</button>
							</form>
						{/if}
					</div>

					<div
						class="mt-4 grid grid-cols-[1fr_auto] items-center gap-2 border-t border-neutral-800 pt-4"
					>
						<code
							class="min-w-0 truncate rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[12.5px] text-neutral-100"
						>
							{data.installCommand}
						</code>
						<button
							type="button"
							onclick={copyCommand}
							class="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-700"
						>
							{copiedCommand ? 'Copied' : 'Copy'}
						</button>
						{#if !data.cli.npm}
							<p class="col-span-2 m-0 text-xs text-neutral-500">
								npm wasn't found in your shell — install <a
									href="https://nodejs.org"
									target="_blank"
									rel="noreferrer"
									class="text-accent-400">Node.js</a
								> first, then run the command above.
							</p>
						{/if}
					</div>

					{#if form?.installCli && 'error' in form.installCli}
						<p class="mt-3 mb-0 font-mono text-xs whitespace-pre-wrap text-red-400">
							{form.installCli.error}
						</p>
					{/if}
				{/if}
			</div>
		</section>
	{/if}

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
				<div class="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
					Active connections
				</div>
				<div class="mt-1 text-2xl font-semibold text-white tabular-nums">
					{stats.connections}
				</div>
			</div>
			<div>
				<div class="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
					DHT nodes
				</div>
				<div class="mt-1 text-2xl font-semibold text-white tabular-nums">
					{stats.dhtNodes}
				</div>
			</div>
		</div>
	</section>

	<!-- SEEDING -->
	<section class="mb-5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
		<div class="border-b border-neutral-800 px-5 py-3.5">
			<h2 class="m-0 text-[15px] font-semibold text-white">Seeding</h2>
			<p class="m-0 mt-0.5 text-xs text-neutral-400">
				Help others by reseeding repositories you've cloned.
			</p>
		</div>
		<div class="px-5 py-5">
			<form
				bind:this={seedForm}
				method="POST"
				action="?/setSeedReadOnly"
				use:enhance={() => {
					// Optimistic flip already happened on click; just submit and
					// let the loader rerun. No spinner — the server-side toggle
					// is local-only and essentially instantaneous.
					return async ({ update }) => {
						await update();
					};
				}}
				class="flex items-start justify-between gap-4"
			>
				<div class="min-w-0">
					<div class="text-sm font-medium text-white">Seed cloned repositories</div>
					<p class="mt-1 text-xs text-neutral-400">
						When on, your device announces repos you've cloned on the DHT so other peers can pull
						from you. Turn off on metered connections.
					</p>
				</div>
				<!-- Hidden input carries the desired state to the server.
					Reactive — when seedReadOnly flips, the value updates,
					and we wait a tick before submitting so the form payload
					sees the new value. -->
				<input type="hidden" name="enabled" value={seedReadOnly ? 'on' : 'off'} />
				<button
					type="button"
					role="switch"
					aria-checked={seedReadOnly}
					onclick={toggleSeedReadOnly}
					class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-neutral-700 transition-colors {seedReadOnly
						? 'bg-accent-500/80'
						: 'bg-neutral-800'}"
					aria-label="Toggle seed cloned repositories"
				>
					<span
						class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform {seedReadOnly
							? 'translate-x-6'
							: 'translate-x-1'}"
					></span>
				</button>
			</form>
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
					No blind peers configured. Add one below to keep your repos online even when Gear isn't
					running.
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
								<div
									class="mt-0.5 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase"
								>
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
					class="min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[12.5px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
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
