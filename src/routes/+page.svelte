<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let showNewForm = $state(false);
	let submittingAdd = $state(false);
	let submittingCreate = $state(false);

	const seeding = $derived(data.repos.filter((r) => r.peers > 0).length);

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {}
	}

	function shortUrl(url: string) {
		const match = url.match(/^(git\+pear:\/\/[^.]+\.[^.]+\.)([^/]+)(\/.+)$/);
		if (!match) return url;
		const [, head, key, tail] = match;
		return head + key.slice(0, 6) + '…' + tail;
	}
</script>

<svelte:head>
	<title>Repositories · Gear</title>
</svelte:head>

<main class="mx-auto max-w-[1100px] px-4 pt-6 pb-20 sm:px-6 sm:pt-8">
	<div class="flex-rowitems-end mb-6 flex items-center justify-between gap-3 sm:gap-4">
		<h1 class="m-0 text-xl font-semibold tracking-tight text-white sm:text-[22px]">
			Your repositories
		</h1>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => (showNewForm = !showNewForm)}
				class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:border-neutral-600 hover:bg-neutral-800"
			>
				+ New repository
			</button>
		</div>
	</div>

	{#if showNewForm}
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				submittingCreate = true;
				return async ({ update }) => {
					await update();
					submittingCreate = false;
				};
			}}
			class="mb-5 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-4 sm:grid-cols-[1fr_auto]"
		>
			<input
				type="text"
				name="name"
				placeholder="my-new-repo"
				autocomplete="off"
				required
				pattern="[a-zA-Z0-9_\-]+"
				class="min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={submittingCreate}
				class="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-accent-900 shadow-sm transition-colors hover:bg-accent-400 disabled:opacity-60"
			>
				{submittingCreate ? 'Creating…' : 'Create'}
			</button>
			{#if form?.create?.error}
				<p class="m-0 text-sm text-red-400 sm:col-span-2">{form.create.error}</p>
			{/if}
		</form>
	{/if}

	<form
		method="POST"
		action="?/add"
		use:enhance={() => {
			submittingAdd = true;
			return async ({ update }) => {
				await update();
				submittingAdd = false;
			};
		}}
		class="mb-5 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-4 sm:grid-cols-[1fr_auto]"
	>
		<input
			type="text"
			name="url"
			placeholder="git+pear://0.247.abc123…xyz/repo-name"
			autocomplete="off"
			required
			class="min-w-0 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[13px] text-white placeholder:text-neutral-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/20 focus:outline-none"
		/>
		<button
			type="submit"
			disabled={submittingAdd}
			class="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-500 px-3.5 py-2 text-sm font-semibold text-accent-900 shadow-sm transition-colors hover:bg-accent-400 disabled:opacity-60"
		>
			{submittingAdd ? 'Syncing…' : 'Add from URL'}
		</button>
		{#if form?.add?.error}
			<p class="m-0 text-sm text-red-400 sm:col-span-2">{form.add.error}</p>
		{/if}
	</form>

	{#if data.repos.length === 0}
		<div class="rounded-lg border border-neutral-800 bg-neutral-900 px-6 py-12 text-center">
			<h3 class="m-0 text-base font-semibold text-white">No repositories yet</h3>
			<p class="mt-1.5 text-sm text-neutral-400">
				Create a new one or add an existing <span class="font-mono">git+pear://</span> URL above.
			</p>
		</div>
	{:else}
		<div class="min-w-0 pb-4">
			<p class="mt-1 text-sm text-neutral-400">
				{data.repos.length} repositor{data.repos.length === 1 ? 'y' : 'ies'}
				· {seeding} seeding
			</p>
		</div>
		<div class="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
			<ul class="m-0 list-none p-0">
				{#each data.repos as repo (repo.name)}
					<li
						class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 p-4 px-5 transition-colors last:border-b-0 hover:bg-neutral-800/40 sm:flex-nowrap"
					>
						<div class="min-w-0 flex-1">
							{#if repo.writable}
								<!-- Kicker sits above the name in a fixed position so it
									reads the same way on every row, regardless of how
									long the repo name is. -->
								<div
									class="mb-0.5 text-[10px] font-semibold tracking-[0.14em] text-accent-300 uppercase"
									title="You are the writer of this repo"
								>
									Owner
								</div>
							{/if}
							<div class="flex items-center gap-2.5 text-[15px] font-semibold">
								<a href="/{repo.name}" class="text-white no-underline hover:text-accent-400">
									{repo.name}
								</a>
							</div>
							<div
								class="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-neutral-500"
							>
								<span>
									<strong class="font-semibold text-neutral-200"
										>{repo.length.toLocaleString()}</strong
									>
									block{repo.length === 1 ? '' : 's'}
								</span>
								<span>
									<strong class="font-semibold text-neutral-200">{repo.peers}</strong>
									peer{repo.peers === 1 ? '' : 's'}
								</span>
								<span class="hidden min-w-0 truncate font-mono sm:inline" title={repo.url}>
									{shortUrl(repo.url)}
								</span>
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<button
								type="button"
								onclick={() => copy(repo.url)}
								title="Copy URL"
								aria-label="Copy URL"
								class="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
							>
								⧉
							</button>
							<a
								href="/{repo.name}"
								class="inline-flex items-center rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white no-underline hover:bg-neutral-700"
							>
								Open
							</a>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</main>
