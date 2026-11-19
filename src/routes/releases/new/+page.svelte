<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import { avatar, shortKey } from '$lib/releases';
	import { initials } from '$lib/initials';

	let { data, form }: PageProps = $props();

	type Draft = { key: string; label: string; me: boolean };

	let name = $state('');
	// The form starts from the load and is the user's from then on.
	let repo = $state(untrack(() => data.repo ?? data.repos[0] ?? ''));
	let signers = $state<Draft[]>([{ key: untrack(() => data.seat), label: '', me: true }]);
	let quorum = $state(1);
	let pasted = $state('');
	let pastedLabel = $state('');
	let creating = $state(false);

	const n = $derived(signers.length);

	$effect(() => {
		if (quorum > n) quorum = n;
	});

	function addSigner() {
		const key = pasted.trim();
		if (!key || signers.some((s) => s.key === key)) return;
		signers.push({ key, label: pastedLabel.trim(), me: false });
		pasted = '';
		pastedLabel = '';
		if (n === 2 && quorum === 1) quorum = 2;
	}

	function remove(i: number) {
		signers.splice(i, 1);
	}

	// Seats around a triangle-ish ring for the preview, lit up to the quorum.
	const preview = $derived(
		signers.map((s, i) => {
			const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
			return {
				x: 110 + (n === 1 ? 0 : 86 * Math.cos(a)),
				y: 110 + (n === 1 ? -86 : 86 * Math.sin(a)),
				on: i < quorum,
				text: s.me ? 'You' : s.label ? initials(s.label) : s.key.slice(0, 2).toUpperCase()
			};
		})
	);

	const steps = $derived([
		{ label: 'Name & source', done: name.trim() !== '' && repo !== '' },
		{ label: 'Signers', done: n > 1 },
		{ label: 'Threshold', done: n > 1 },
		{ label: 'Create', done: false }
	]);
</script>

<svelte:head>
	<title>New release key · Gear</title>
</svelte:head>

<main class="mx-auto max-w-[1280px] px-4 pt-6 pb-20 sm:px-8 sm:pt-9">
	<nav class="mb-4 flex items-center gap-2 text-[13px] text-fg-3">
		<a href="/releases" class="tap-44 text-fg-2 no-underline hover:text-accent-300">Release keys</a>
		<span>/</span>
		<span class="text-fg-2">New</span>
	</nav>

	<h1
		class="m-0 mb-7 font-display text-[36px] leading-none font-semibold tracking-[-0.035em] text-fg sm:text-[48px]"
	>
		New release key
	</h1>

	<form
		method="POST"
		action="?/create"
		class="flex flex-wrap items-start gap-8"
		use:enhance={() => {
			creating = true;
			return async ({ update }) => {
				await update({ reset: false });
				creating = false;
			};
		}}
	>
		<ol aria-label="Steps" class="m-0 hidden flex-[0_1_220px] list-none flex-col gap-1 p-0 lg:flex">
			{#each steps as s, i (s.label)}
				<li
					class="flex items-center gap-3 rounded-[10px] px-3 py-2.5 font-medium {s.done
						? 'text-fg-2'
						: 'text-fg'}"
				>
					<span
						class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold {s.done
							? 'bg-accent-400/16 text-accent-300'
							: 'bg-surface-3 text-fg-3'}">{s.done ? '✓' : i + 1}</span
					>
					{s.label}
				</li>
			{/each}
		</ol>

		<div class="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
			<section
				aria-label="Name and source"
				class="grid grid-cols-1 gap-3.5 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset sm:grid-cols-2"
			>
				<label class="flex flex-col gap-1.5 text-xs text-fg-2">
					Name
					<input
						name="name"
						bind:value={name}
						required
						autocomplete="off"
						spellcheck="false"
						placeholder="{repo || 'repo'}/stable"
						class="h-11 rounded-[10px] border-0 bg-bg px-3 font-mono text-sm text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none sm:h-10"
					/>
				</label>
				<label class="flex flex-col gap-1.5 text-xs text-fg-2">
					Releases come from
					<select
						name="repo"
						bind:value={repo}
						required
						class="h-11 rounded-[10px] border-0 bg-bg px-2.5 text-sm text-fg ring-1 ring-line-strong ring-inset focus:ring-2 focus:ring-accent-400/50 focus:outline-none sm:h-10"
					>
						{#each data.repos as r (r)}
							<option value={r}>{r} · tags</option>
						{/each}
					</select>
					{#if data.repos.length === 0}
						<span class="text-fg-3">Add a repo to your library first.</span>
					{/if}
				</label>
			</section>

			<section
				aria-label="Signers"
				class="flex flex-col gap-3.5 rounded-[18px] bg-surface p-5 ring-1 ring-accent-300/20 ring-inset"
			>
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h2 class="m-0 text-xl font-semibold text-fg">Who signs</h2>
					<span class="text-xs text-fg-3">
						Each signer holds their own key. Nobody holds all of them.
					</span>
				</div>

				{#each signers as s, i (s.key)}
					<div
						class="flex items-center gap-3.5 rounded-xl bg-surface-2 px-3.5 py-3 ring-1 ring-white/4 ring-inset"
					>
						<span
							class="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold {avatar(
								i
							)}"
							aria-hidden="true"
							>{s.me ? 'You' : s.label ? initials(s.label) : s.key.slice(0, 2).toUpperCase()}</span
						>
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="truncate font-semibold text-fg">
								{s.me ? 'You' : s.label || 'Signer'}
							</span>
							<span class="truncate font-mono text-xs text-fg-3">
								{shortKey(s.key)}{s.me ? ' · this device' : ''}
							</span>
						</div>
						<input type="hidden" name="signer" value={s.key} />
						<input type="hidden" name="label" value={s.label} />
						{#if !s.me}
							<button
								type="button"
								onclick={() => remove(i)}
								aria-label="Remove {s.label || shortKey(s.key)}"
								class="tap-44 flex cursor-pointer rounded-lg p-1.5 text-fg-3 hover:text-fg"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg
								>
							</button>
						{/if}
					</div>
				{/each}

				<div class="flex flex-wrap gap-2.5">
					<label class="sr-only" for="signer-key">Signing key</label>
					<input
						id="signer-key"
						bind:value={pasted}
						autocomplete="off"
						spellcheck="false"
						placeholder="Paste a co-signer's signing key"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								addSigner();
							}
						}}
						class="h-11 min-w-0 flex-[1_1_300px] rounded-[10px] border-0 bg-bg px-3 font-mono text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
					/>
					<label class="sr-only" for="signer-name">Their name</label>
					<input
						id="signer-name"
						bind:value={pastedLabel}
						autocomplete="off"
						placeholder="Name (only on this device)"
						class="h-11 min-w-0 flex-[1_1_180px] rounded-[10px] border-0 bg-bg px-3 text-[13px] text-fg ring-1 ring-line-strong ring-inset placeholder:text-fg-3 focus:ring-2 focus:ring-accent-400/50 focus:outline-none"
					/>
					<button
						type="button"
						onclick={addSigner}
						class="h-11 w-full cursor-pointer rounded-[10px] bg-surface-4 px-3.5 text-[13px] font-medium text-fg hover:bg-surface-3 sm:w-auto"
					>
						Add signer
					</button>
					<span class="basis-full text-xs text-fg-3">
						Each device is its own seat. Co-signers find their key in Settings, under Your signing
						key. Add your other devices the same way.
					</span>
				</div>
			</section>

			<section
				aria-label="Threshold"
				class="flex flex-wrap items-center gap-6 rounded-[18px] bg-surface p-5 ring-1 ring-line ring-inset"
			>
				<div class="flex flex-[1_1_280px] flex-col gap-2">
					<h2 class="m-0 text-xl font-semibold text-fg">How many must agree</h2>
					<p class="m-0 leading-normal text-fg-2">
						Higher is safer against a stolen key. Lower keeps releases moving when people are away.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-4">
					<div
						role="group"
						aria-label="Signatures required"
						class="flex flex-wrap gap-1.5 rounded-[14px] bg-bg p-[5px] ring-1 ring-white/6 ring-inset"
					>
						{#each { length: n }, i}
							<button
								type="button"
								aria-pressed={quorum === i + 1}
								onclick={() => (quorum = i + 1)}
								class="h-14 w-14 cursor-pointer rounded-[10px] font-display text-xl font-semibold transition-colors sm:w-16 {quorum ===
								i + 1
									? 'bg-accent-400 text-accent-900 shadow-[0_0_24px_rgb(35_204_148/0.45)]'
									: 'text-fg-2 hover:text-fg'}">{i + 1}</button
							>
						{/each}
					</div>
					<span class="text-[15px] font-medium text-fg-2">
						of <b class="text-fg">{n}</b>
						{n === 1 ? 'signer' : 'signers'}
					</span>
				</div>
				<input type="hidden" name="quorum" value={quorum} />
				<p
					class="m-0 flex basis-full items-start gap-2.5 rounded-xl bg-bg px-3.5 py-3 text-[13px] leading-normal text-fg-2 ring-1 ring-white/6 ring-inset"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#5dddad"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
						class="mt-0.5 flex-none"
						><rect x="5" y="11" width="14" height="10" rx="2" /><path
							d="M8 11V7a4 4 0 0 1 8 0v4"
						/></svg
					>
					<span>
						Signers and threshold are locked in: together they <b class="font-medium text-fg">are</b
						>
						the key. To change them later you make a new key, and the current signers sign a last release
						pointing to it.
					</span>
				</p>
			</section>
		</div>

		<aside class="relative min-w-0 flex-[1_1_340px]">
			<section
				aria-label="Preview"
				class="flex flex-col items-center gap-[18px] rounded-[22px] bg-linear-165 from-[#12251d] to-[#0a110d] to-70% p-6 text-center shadow-[inset_0_0_0_1px_rgb(93_221_173/0.25),0_30px_80px_rgb(0_0_0/0.5),0_0_60px_rgb(35_204_148/0.08)]"
			>
				<svg
					width="220"
					height="220"
					viewBox="0 0 220 220"
					role="img"
					aria-label="Threshold preview: {quorum} of {n} signers"
					class="max-w-full"
				>
					<circle cx="110" cy="110" r="86" fill="none" stroke="rgb(93 221 173 / 0.12)" />
					{#each preview as p, i (i)}
						<circle
							cx={p.x}
							cy={p.y}
							r="18"
							fill={p.on ? '#23cc94' : '#0c1410'}
							stroke={p.on ? 'none' : '#407e62'}
							stroke-width="2"
							style={p.on ? 'filter: drop-shadow(0 0 10px #23cc94)' : ''}
						/>
						<text
							x={p.x}
							y={p.y + 4}
							text-anchor="middle"
							font-family="Inter"
							font-weight="700"
							font-size="11"
							fill={p.on ? '#04241a' : '#9aaca3'}>{p.text}</text
						>
					{/each}
					<text
						x="110"
						y="116"
						text-anchor="middle"
						font-family="Space Grotesk"
						font-weight="600"
						font-size="40"
						fill="#e8f1ec">{quorum}/{n}</text
					>
					<text
						x="110"
						y="138"
						text-anchor="middle"
						font-family="Inter"
						font-size="11"
						fill="#9aaca3"
						>{quorum === n
							? n === 1
								? 'you release alone'
								: 'everyone must sign'
							: `any ${quorum} can release`}</text
					>
				</svg>
				<div class="flex flex-col gap-1.5">
					<span class="font-display text-xl font-semibold break-all text-fg">
						{name.trim() || 'Unnamed key'}
					</span>
					<span class="text-[13px] leading-normal text-fg-2">
						A new core, separate from the repo. Each release names a tag, its commit and tree hash,
						and the repo length it was cut from.
					</span>
				</div>
				<button
					type="submit"
					disabled={creating || !name.trim() || !repo}
					class="h-12 w-full cursor-pointer rounded-xl bg-accent-400 text-[15px] font-semibold text-accent-900 shadow-[0_10px_30px_rgb(35_204_148/0.35)] transition-colors hover:bg-accent-300 disabled:cursor-default disabled:opacity-50"
				>
					{creating ? 'Creating…' : 'Create release key'}
				</button>
				{#if form?.create?.error}
					<p class="m-0 text-sm text-red-400">{form.create.error}</p>
				{/if}
				<span class="text-xs text-fg-3">
					Then propose a release and send it to your co-signers to sign.
				</span>
			</section>
		</aside>
	</form>
</main>
