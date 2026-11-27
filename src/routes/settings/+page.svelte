<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, tick } from 'svelte';
	import type { UpdateState } from '$lib/server/pear';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submittingAdd = $state(false);
	let copied = $state(false);
	let installing = $state(false);
	let restarting = $state(false);
	let copiedCommand = $state(false);
	let moreOpen = $state(false);

	const checkNote = $derived.by(() => {
		const check = form?.check;
		if (check?.found) return { text: `${check.found} found`, tone: 'text-accent-300' };
		if (check?.none) return { text: `nothing newer than ${check.none}`, tone: 'text-neutral-400' };
		if (check?.error) return { text: check.error, tone: 'text-red-400' };
		return { text: 'Builds from source — this takes a few minutes.', tone: 'text-neutral-400' };
	});

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

	// App update progress, same stream. 'idle' in dev and in any build without
	// an upgrade link, in which case the section stays hidden.
	let update = $state<UpdateState>(data.update);

	// Mirrors the server's cap so a long build can't grow this without bound.
	const LOG_LIMIT = 300;

	// What the rebuild is saying. Seeded from SSR so a reload mid-build does not
	// start blank, then appended to from the event stream.
	let buildLog = $state<string[]>(data.buildLog ?? []);

	// Pinned to the newest line unless the user has scrolled up to read.
	let logBox: HTMLDivElement | null = $state(null);
	let logPinned = $state(true);

	$effect(() => {
		// Referenced so this re-runs on every appended line.
		buildLog.length;
		if (!logBox || !logPinned) return;
		const box = logBox;
		tick().then(() => requestAnimationFrame(() => (box.scrollTop = 0)));
	});

	const logLines = $derived([...buildLog].reverse());

	function onLogScroll() {
		if (!logBox) return;
		logPinned = Math.abs(logBox.scrollTop) < 24;
	}

	const updateLabel = $derived.by(() => {
		switch (update.status) {
			case 'checking':
				return 'Checking for updates';
			case 'available':
				return `Version ${update.version} is available`;
			case 'building':
				return `Building ${update.version} — ${update.label} (${update.step} of ${update.steps})`;
			case 'applied':
				// With a restart button right below, saying "restart to run it"
				// twice is noise; without one there is nothing else to tell them.
				return data.canRestart
					? `Version ${update.version} installed`
					: `Version ${update.version} installed — restart to run it`;
			case 'failed':
				return `Update failed: ${update.error}`;
			default:
				return 'Up to date';
		}
	});

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
		es.addEventListener('update', (e) => {
			try {
				update = JSON.parse((e as MessageEvent).data);
			} catch {
				// malformed payload — drop it
			}
		});
		// `reset` is the snapshot the stream opens with; everything after is a
		// handful of new lines to append.
		es.addEventListener('build-log', (e) => {
			try {
				const payload = JSON.parse((e as MessageEvent).data);
				const lines: string[] = payload.lines ?? [];
				buildLog = (payload.reset ? lines : [...buildLog, ...lines]).slice(-LOG_LIMIT);
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

	let copiedSigningKey = $state(false);

	let copiedPear = $state<string | null>(null);

	async function copyPearKey(name: string, key: string) {
		try {
			await navigator.clipboard.writeText(key);
			copiedPear = name;
			setTimeout(() => (copiedPear = null), 1200);
		} catch {}
	}

	async function copySigningKey() {
		try {
			await navigator.clipboard.writeText(data.signingKey);
			copiedSigningKey = true;
			setTimeout(() => (copiedSigningKey = false), 1200);
		} catch {}
	}

	function shortPeer(key: string) {
		return key.slice(0, 8) + '…' + key.slice(-6);
	}
</script>

<svelte:head>
	<title>Settings · Gear</title>
</svelte:head>

<main class="mx-auto max-w-[900px] px-4 pt-6 pb-20 sm:px-8 sm:pt-10">
	<header class="mb-8">
		<h1
			class="m-0 font-display text-[40px] leading-[1.02] font-semibold tracking-[-0.035em] text-fg sm:text-[52px]"
		>
			Settings
		</h1>
		<p class="mt-3 mb-0 text-base text-fg-2">
			Manage your peer identity, network, and the blind peers that seed your repos.
		</p>
	</header>

	<!-- IDENTITY -->
	<section class="mb-5 overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
		<div class="border-b border-line bg-surface-2 px-5 py-3.5">
			<h2 class="m-0 text-base font-semibold text-fg">Identity</h2>
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
					class="min-w-0 rounded-[10px] bg-bg px-3 py-2 font-mono text-[12.5px] break-all text-neutral-100 ring-1 ring-line-strong ring-inset"
				>
					{data.identity}
				</code>
				<button
					type="button"
					onclick={copyIdentity}
					class="tap-44 cursor-pointer justify-self-start rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-4 sm:justify-self-auto"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>
	</section>

	<!-- SIGNING KEY -->
	<section class="mb-5 overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
		<div class="border-b border-line bg-surface-2 px-5 py-3.5">
			<h2 class="m-0 text-base font-semibold text-fg">Your signing keys</h2>
			<p class="m-0 mt-0.5 text-xs text-neutral-400">
				Send one to whoever sets up a release key, so they can add you as a signer. The Gear key's
				secret half stays on this device; a pear key signs with its password.
			</p>
		</div>
		<div class="px-5 py-5">
			<div class="grid grid-cols-1 items-start gap-2 sm:grid-cols-[140px_1fr_auto] sm:gap-3">
				<label for="signing-key" class="text-xs font-medium text-neutral-400 sm:pt-2">
					Gear key
				</label>
				<code
					id="signing-key"
					class="min-w-0 rounded-[10px] bg-bg px-3 py-2 font-mono text-[12.5px] break-all text-neutral-100 ring-1 ring-line-strong ring-inset"
				>
					{data.signingKey}
				</code>
				<button
					type="button"
					onclick={copySigningKey}
					class="tap-44 cursor-pointer justify-self-start rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-4 sm:justify-self-auto"
				>
					{copiedSigningKey ? 'Copied' : 'Copy'}
				</button>
				{#each data.pearKeys as k (k.name)}
					<span class="text-xs font-medium text-neutral-400 sm:pt-2">
						pear key <span class="font-mono text-fg-2">{k.name}</span>
					</span>
					<code
						class="min-w-0 rounded-[10px] bg-bg px-3 py-2 font-mono text-[12.5px] break-all text-neutral-100 ring-1 ring-line-strong ring-inset"
					>
						{k.key}
					</code>
					<button
						type="button"
						onclick={() => copyPearKey(k.name, k.key)}
						class="tap-44 cursor-pointer justify-self-start rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-4 sm:justify-self-auto"
					>
						{copiedPear === k.name ? 'Copied' : 'Copy'}
					</button>
				{/each}
			</div>
			{#if data.pearKeys.length > 0}
				<p class="m-0 mt-3 text-xs text-neutral-400">
					pear keys come from <span class="font-mono">~/.pear</span>, as
					<span class="font-mono">pear multisig keys list</span> shows them.
				</p>
			{/if}
		</div>
	</section>

	<!-- COMMAND LINE -->
	{#if data.cli}
		<section class="mb-5 overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
			<div class="border-b border-line bg-surface-2 px-5 py-3.5">
				<h2 class="m-0 text-base font-semibold text-fg">Command line</h2>
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
								Downloads the prebuilt <code class="font-mono">gip</code> binaries for this machine over
								Pear. No npm or toolchain needed.
							</p>
						</div>
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
								class="inline-flex cursor-pointer items-center justify-center rounded-[10px] bg-accent-400 px-3.5 py-2 text-sm font-semibold text-accent-900 hover:bg-accent-300 disabled:opacity-60"
							>
								{installing ? 'Installing…' : 'Install CLI'}
							</button>
						</form>
					</div>

					<div class="mt-4 grid grid-cols-[1fr_auto] items-center gap-2 border-t border-line pt-4">
						<code
							class="min-w-0 truncate rounded-[10px] bg-bg px-3 py-2 font-mono text-[12.5px] text-neutral-100 ring-1 ring-line-strong ring-inset"
						>
							{data.installCommand}
						</code>
						<button
							type="button"
							onclick={copyCommand}
							class="tap-44 cursor-pointer rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-4"
						>
							{copiedCommand ? 'Copied' : 'Copy'}
						</button>
						<p class="col-span-2 m-0 text-xs text-neutral-500">
							Or run it yourself.{#if !data.cli.pear}&nbsp;This command needs the <a
									href="https://install.pears.com"
									target="_blank"
									rel="noreferrer"
									class="text-accent-400">Pear runtime</a
								>, which wasn't found in your shell — the button above doesn't.{/if}
						</p>
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
	<section class="mb-5 overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
		<div class="border-b border-line bg-surface-2 px-5 py-3.5">
			<h2 class="m-0 text-base font-semibold text-fg">Network</h2>
			<p class="m-0 mt-0.5 text-xs text-neutral-400">
				Live Hyperswarm connectivity for this process.
			</p>
		</div>
		<div class="grid grid-cols-2 gap-5 px-5 py-5">
			<div>
				<div class="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
					Active connections
				</div>
				<div
					class="mt-1 font-display text-[30px] font-semibold tracking-[-0.02em] text-fg tabular-nums"
				>
					{stats.connections}
				</div>
			</div>
			<div>
				<div class="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
					DHT nodes
				</div>
				<div
					class="mt-1 font-display text-[30px] font-semibold tracking-[-0.02em] text-fg tabular-nums"
				>
					{stats.dhtNodes}
				</div>
			</div>
		</div>
	</section>

	<!-- UPDATES -->
	{#if update.status !== 'idle' || data.version}
		<section
			id="updates"
			class="relative mb-5 scroll-mt-24 rounded-lg border border-neutral-800 bg-neutral-900"
		>
			{#if update.status !== 'building' && update.status !== 'applied'}
				{@const pending = update.status === 'available' ? update.version : null}
				{@const stale = update.status === 'failed' ? update.version : null}
				{@const split = stale !== null}
				{@const skin = pending
					? {
							text: 'text-accent-300',
							ring: 'ring-accent-400/40',
							fill: 'bg-accent-400/10',
							hover: 'hover:bg-accent-400/20'
						}
					: stale
						? {
								text: 'text-amber-300',
								ring: 'ring-amber-400/40',
								fill: 'bg-amber-400/10',
								hover: 'hover:bg-amber-400/20'
							}
						: {
								text: 'text-neutral-200',
								ring: 'ring-neutral-700',
								fill: 'bg-neutral-800',
								hover: 'hover:bg-neutral-700'
							}}
				{@const open = split && moreOpen}
				<div class="absolute top-3 right-[17px] z-20">
					<div class="flex items-stretch">
						<form
							method="POST"
							action={pending ? '?/applyUpdate' : '?/check'}
							use:enhance
							onsubmit={() => (moreOpen = false)}
						>
							<button
								type="submit"
								disabled={update.status === 'checking'}
								class="inline-flex h-[41px] cursor-pointer items-center justify-center rounded-l-lg px-4 text-[15px] font-semibold ring-1 transition-colors ring-inset disabled:opacity-60 {skin.text} {skin.ring} {skin.fill} {skin.hover} {split
									? ''
									: 'rounded-r-lg'} {open ? 'rounded-bl-none' : ''}"
							>
								{#if update.status === 'checking'}
									Checking…
								{:else if pending}
									Install {pending}
								{:else if stale}
									Fix Check
								{:else}
									Check
								{/if}
							</button>
						</form>
						{#if split}
							<button
								type="button"
								aria-label="Other update actions"
								aria-expanded={moreOpen}
								disabled={update.status === 'checking'}
								onclick={() => (moreOpen = !moreOpen)}
								class="ml-px inline-flex h-[41px] cursor-pointer items-center rounded-r-lg px-3 ring-1 transition-colors ring-inset disabled:opacity-60 {skin.text} {skin.ring} {skin.fill} {skin.hover} {open
									? 'rounded-br-none'
									: ''}"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M6 9l6 6 6-6" />
								</svg>
							</button>
						{/if}
					</div>
					{#if split}
						<div
							hidden={!moreOpen}
							class="absolute top-full right-0 z-20 -mt-px w-full overflow-hidden rounded-b-lg bg-neutral-900 shadow-lg ring-1 ring-inset {skin.ring}"
						>
							<form
								method="POST"
								action="?/applyUpdate"
								use:enhance
								onsubmit={() => (moreOpen = false)}
							>
								<button
									type="submit"
									class="block w-full cursor-pointer px-4 py-2.5 text-left text-[15px] font-semibold whitespace-nowrap transition-colors {skin.text} {skin.hover}"
								>
									Rebuild {stale ?? data.version}
								</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}
			<div class="border-b border-neutral-800 px-5 py-3.5">
				<h2 class="m-0 text-[15px] font-semibold text-white">Updates</h2>
				<p class="m-0 mt-0.5 text-xs text-neutral-400">
					Builds replicate peer-to-peer from the release channel.
				</p>
			</div>
			<div class="px-5 py-5">
				<div class="flex items-baseline justify-between gap-4">
					<div class="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
						Installed
					</div>
					<div class="font-mono text-sm text-white tabular-nums">{data.version}</div>
				</div>
				<!-- whitespace-pre-line because a failure message is the only thing a
				     user ever sees from a build that ran with no terminal behind it,
				     and it arrives as several lines of instructions. -->
				<p
					class="m-0 mt-3 text-sm whitespace-pre-line {update.status === 'failed'
						? 'text-red-400'
						: update.status === 'applied'
							? 'text-green-400'
							: 'text-neutral-300'}"
				>
					{updateLabel}
				</p>
				{#if update.status === 'building'}
					<!-- Steps are known, duration is not: the bar fills by step
					     rather than pretending to a percentage of time. -->
					<div class="mt-3 h-1 overflow-hidden rounded-full bg-neutral-800">
						<div
							class="h-full rounded-full bg-green-500 transition-all duration-500"
							style="width: {Math.round((update.step / update.steps) * 100)}%"
						></div>
					</div>
				{/if}

				{#if buildLog.length > 0 && update.status !== 'idle'}
					<!-- The build runs detached with no terminal, so this is the only
					     place its output is visible. Scrolls itself unless the user
					     has scrolled up to read something. -->
					<div
						bind:this={logBox}
						onscroll={onLogScroll}
						class="mt-3 flex max-h-44 flex-col-reverse overflow-y-auto rounded-md border border-neutral-800 bg-black/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-400"
					>
						{#each logLines as line, i (i)}
							<div class="break-all whitespace-pre-wrap">{line}</div>
						{/each}
					</div>
				{/if}
				{#if update.status === 'applied' && data.canRestart}
					<!-- The update is already on disk; this process is still the old
					     one. Takes the place of the install button rather than asking
					     the user to go and restart it themselves. -->
					<form
						method="POST"
						action="?/restart"
						use:enhance={() => {
							restarting = true;
							// No-op handler: the server exits while answering, so the
							// default "apply the response" path has nothing to apply.
							return async () => {};
						}}
						class="absolute top-3 right-[17px] z-20"
					>
						<button
							type="submit"
							disabled={restarting}
							class="inline-flex h-[41px] cursor-pointer items-center justify-center rounded-lg bg-pear-400/10 px-4 text-[15px] font-semibold text-pear-300 ring-1 ring-pear-400/40 transition-colors ring-inset hover:bg-pear-400/20 disabled:opacity-60"
						>
							{restarting ? 'Restarting…' : 'Restart Gear'}
						</button>
					</form>
					{#if restarting}
						<p class="m-0 mt-2 text-xs text-neutral-400">
							This window closes as the new version starts.
						</p>
					{/if}
				{/if}

				{#if update.status !== 'building' && update.status !== 'applied'}
					<p class="m-0 mt-2 text-xs {checkNote.tone}">{checkNote.text}</p>
				{/if}
			</div>
		</section>
	{/if}

	<!-- SEEDING -->
	<section class="mb-5 overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
		<div class="border-b border-line bg-surface-2 px-5 py-3.5">
			<h2 class="m-0 text-base font-semibold text-fg">Seeding</h2>
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
					class="tap-44 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors {seedReadOnly
						? 'bg-accent-400 shadow-glow'
						: 'bg-surface-4 ring-1 ring-line-strong ring-inset'}"
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
	<section class="mb-5 overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
		<div class="border-b border-line bg-surface-2 px-5 py-3.5">
			<h2 class="m-0 text-base font-semibold text-fg">Blind peers</h2>
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
							class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-3 last:border-b-0"
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
									class="tap-44 cursor-pointer rounded-lg bg-transparent px-2.5 py-1 text-xs font-medium text-red-400 ring-1 ring-line-strong transition-colors ring-inset hover:border-red-900/60 hover:bg-red-950/30"
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
				class="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-4 sm:grid-cols-[1fr_auto]"
			>
				<input
					type="text"
					name="peerKey"
					placeholder="z32-encoded public key of a blind peer"
					autocomplete="off"
					required
					value={addPeerError?.value ?? ''}
					class="min-w-0 rounded-[10px] border-0 bg-bg px-3 py-2 font-mono text-[12.5px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
				/>
				<button
					type="submit"
					disabled={submittingAdd}
					class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] bg-accent-400 px-3.5 py-2 text-sm font-semibold text-accent-900 hover:bg-accent-300 disabled:opacity-60"
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
