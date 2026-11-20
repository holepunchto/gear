<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import { initials } from '$lib/initials';
	import type { DraftSigner } from '$lib/releases';
	import SignerList from '$lib/components/releases/SignerList.svelte';
	import Threshold from '$lib/components/releases/Threshold.svelte';

	let { data, form }: PageProps = $props();

	// The form starts from the load and is the user's from then on. Arriving
	// from a repo fills the source step, so it opens already done.
	let name = $state(untrack(() => (data.repo ? `${data.repo}/stable` : '')));
	let repo = $state(untrack(() => data.repo ?? data.repos[0] ?? ''));
	let signers = $state<DraftSigner[]>([{ key: untrack(() => data.seat), label: '', me: true }]);
	let quorum = $state(1);
	let creating = $state(false);

	const n = $derived(signers.length);

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

			<SignerList bind:signers bind:quorum />

			<Threshold bind:quorum {n} />
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
