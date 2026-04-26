<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteMarkdown from '@humanspeak/svelte-markdown';
	import { page } from '$app/state';
	import CommitMessage from '$lib/components/CommitMessage.svelte';

	let { data }: PageProps = $props();

	const repoName = $derived(page.params.repo);
	const ref = $derived(data.ref);
	const path = $derived('path' in data ? data.path : '');

	// Path segments for breadcrumb: ['src', 'server', 'file.ts']
	const segments = $derived(path ? path.split('/') : []);
	const crumbs = $derived(
		segments.map((name, i) => ({
			name,
			href: `/${repoName}/${ref}/${segments.slice(0, i + 1).join('/')}`
		}))
	);

	// Is the current file a markdown doc? If so we offer a Rendered/Source toggle
	// and default to Rendered.
	const isMarkdown = $derived(
		data.kind === 'file' && /\.(md|markdown)$/i.test(data.name)
	);

	let renderedMode = $state(true);
	// Reset the toggle whenever we navigate to a different file.
	$effect(() => {
		void path;
		renderedMode = true;
	});

	function formatSize(n: number) {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
		return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
	}

	// Recency hint for the apricot accent — within the last day.
	const RECENT_MS = 24 * 60 * 60 * 1000;
	function isRecent(timestampSeconds: number) {
		return Date.now() - timestampSeconds * 1000 < RECENT_MS;
	}

	function relativeTime(timestampSeconds: number) {
		const ms = Date.now() - timestampSeconds * 1000;
		if (ms < 60_000) return 'just now';
		const m = Math.floor(ms / 60_000);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 30) return `${d}d ago`;
		const mo = Math.floor(d / 30);
		if (mo < 12) return `${mo}mo ago`;
		return `${Math.floor(mo / 12)}y ago`;
	}

	function isoDate(timestampSeconds: number) {
		return new Date(timestampSeconds * 1000).toISOString();
	}
</script>

<!-- Path breadcrumb (when drilled in) -->
{#if segments.length}
	<nav class="mb-3 flex flex-wrap items-center gap-1 font-mono text-sm text-neutral-400">
		<a href="/{repoName}/{ref}/" class="text-neutral-400 no-underline hover:text-accent-400">
			{repoName}
		</a>
		{#each crumbs as crumb, i}
			<span class="text-neutral-700">/</span>
			{#if i === crumbs.length - 1}
				<span class="text-white">{crumb.name}</span>
			{:else}
				<a href={crumb.href} class="text-neutral-400 no-underline hover:text-accent-400">
					{crumb.name}
				</a>
			{/if}
		{/each}
	</nav>
{/if}

<!-- Toolbar: ref chip + item count -->
<div
	class="flex flex-wrap items-center gap-2 rounded-t-lg border border-b-0 border-neutral-800 bg-neutral-900 px-3 py-2.5 sm:gap-3 sm:px-3.5"
>
	<span
		class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[13px] font-medium text-white"
		title="Current ref"
	>
		<svg
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-neutral-400"
			aria-hidden="true"
		>
			<line x1="6" x2="6" y1="3" y2="15" />
			<circle cx="18" cy="6" r="3" />
			<circle cx="6" cy="18" r="3" />
			<path d="M18 9a9 9 0 0 1-9 9" />
		</svg>
		{ref}
	</span>
	<span class="flex-1"></span>
	{#if data.kind === 'tree'}
		<span class="text-xs text-neutral-500">
			<strong class="font-semibold text-neutral-200">{data.items.length}</strong>
			item{data.items.length === 1 ? '' : 's'}
		</span>
	{:else}
		<span class="text-xs text-neutral-500 tabular-nums">
			{formatSize(data.size)}
		</span>
		{#if isMarkdown}
			<!-- Rendered/Source toggle — only for markdown files, pure client-side -->
			<div
				class="inline-flex overflow-hidden rounded-md border border-neutral-700 text-xs font-medium"
				role="group"
				aria-label="View mode"
			>
				<button
					type="button"
					onclick={() => (renderedMode = true)}
					class="px-2.5 py-1 transition-colors {renderedMode
						? 'bg-neutral-800 text-white'
						: 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800/60 hover:text-white'}"
					aria-pressed={renderedMode}
				>
					Rendered
				</button>
				<button
					type="button"
					onclick={() => (renderedMode = false)}
					class="border-l border-neutral-700 px-2.5 py-1 transition-colors {!renderedMode
						? 'bg-neutral-800 text-white'
						: 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800/60 hover:text-white'}"
					aria-pressed={!renderedMode}
				>
					Source
				</button>
			</div>
		{/if}
		<a
			href={`/api/raw/${repoName}/${ref}/${data.path}`}
			class="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white no-underline hover:bg-neutral-700"
		>
			Raw
		</a>
	{/if}
</div>

{#if data.kind === 'tree'}
	<!-- FILE TREE -->
	<div class="overflow-hidden rounded-b-lg border border-neutral-800 bg-neutral-900">
		{#if data.items.length === 0}
			<div class="px-5 py-10 text-center text-sm text-neutral-500">This folder is empty.</div>
		{:else}
			<table class="w-full border-collapse text-[13px]">
				<tbody>
					{#each data.items as item (item.name)}
						<tr class="border-b border-neutral-800 last:border-b-0 hover:bg-neutral-800/40">
							<td class="w-6 py-2.5 pr-0 pl-4 align-middle">
								{#if item.kind === 'dir'}
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="currentColor"
										class="text-accent-400"
										aria-hidden="true"
									>
										<path
											d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"
										/>
									</svg>
								{:else}
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="text-neutral-500"
										aria-hidden="true"
									>
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
										<polyline points="14 2 14 8 20 8" />
									</svg>
								{/if}
							</td>
							<td class="w-1/3 max-w-0 py-2.5 pr-4 pl-2 align-middle">
								<a
									href="/{repoName}/{ref}{item.path}"
									class="block truncate font-medium text-white no-underline hover:text-accent-400"
								>
									{item.name}
								</a>
							</td>
							<td class="hidden max-w-0 py-2.5 pr-4 align-middle text-xs text-neutral-500 sm:table-cell">
								{#if item.commit}
									<div class="block truncate">
										<CommitMessage parsed={item.commit.message} variant="compact" />
									</div>
								{:else}
									<span class="text-neutral-700">—</span>
								{/if}
							</td>
							<td
								class="w-24 py-2.5 pr-5 pl-0 text-right align-middle font-mono text-xs tabular-nums whitespace-nowrap"
							>
								{#if item.commit}
									<span
										class={isRecent(item.commit.timestamp)
											? 'text-apricot-300'
											: 'text-neutral-500'}
										title={isoDate(item.commit.timestamp)}
									>
										{relativeTime(item.commit.timestamp)}
									</span>
								{:else}
									<span class="text-neutral-500">
										{item.kind === 'file' ? formatSize(item.size) : '—'}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<!-- README PREVIEW -->
	{#if data.readme}
		<div class="mt-5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
			<div
				class="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-2.5 text-xs font-semibold text-neutral-400"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
					<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
				</svg>
				{data.readme.name}
			</div>
			<div
				class="prose prose-sm prose-invert prose-neutral max-w-none px-4 py-5 sm:prose-base sm:px-7 sm:py-6
					prose-headings:scroll-mt-20
					prose-a:text-accent-400 prose-a:no-underline hover:prose-a:underline
					prose-code:rounded prose-code:bg-neutral-950 prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:text-neutral-200 prose-code:before:content-none prose-code:after:content-none
					prose-pre:rounded-md prose-pre:bg-neutral-950 prose-pre:p-3 sm:prose-pre:p-4"
			>
				<SvelteMarkdown source={data.readme.content} />
			</div>
		</div>
	{/if}
{:else if data.kind === 'file'}
	<!-- FILE VIEW (text, small enough to render) -->
	{#if isMarkdown && renderedMode}
		<div
			class="prose prose-sm prose-invert prose-neutral max-w-none overflow-hidden rounded-b-lg border border-neutral-800 bg-neutral-900 px-4 py-5 sm:prose-base sm:px-7 sm:py-6
				prose-headings:scroll-mt-20
				prose-a:text-accent-400 prose-a:no-underline hover:prose-a:underline
				prose-code:rounded prose-code:bg-neutral-950 prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:text-neutral-200 prose-code:before:content-none prose-code:after:content-none
				prose-pre:rounded-md prose-pre:bg-neutral-950 prose-pre:p-3 sm:prose-pre:p-4"
		>
			<SvelteMarkdown source={data.content} />
		</div>
	{:else}
	<div class="overflow-hidden rounded-b-lg border border-neutral-800 bg-neutral-900">
		<div class="overflow-x-auto">
			<table class="w-full border-collapse font-mono text-[12.5px] leading-[1.55]">
				<tbody>
					{#each data.content.split('\n') as line, i}
						<tr>
							<td
								class="sticky left-0 w-0 border-r border-neutral-800 bg-neutral-900 px-3 text-right align-top whitespace-nowrap text-neutral-600 tabular-nums select-none {i ===
								0
									? 'pt-3.5'
									: ''} {i === data.content.split('\n').length - 1 ? 'pb-3.5' : ''}"
							>
								{i + 1}
							</td>
							<td
								class="px-3.5 align-top whitespace-pre text-neutral-100 {i === 0
									? 'pt-3.5'
									: ''} {i === data.content.split('\n').length - 1 ? 'pb-3.5' : ''}"
								>{line || ' '}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
	{/if}
{:else if data.kind === 'file-binary' || data.kind === 'file-large'}
	<!-- PLACEHOLDER: binary or oversized -->
	<div class="rounded-b-lg border border-neutral-800 bg-neutral-900 px-6 py-14 text-center">
		<div
			class="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-apricot-900/40 text-xl text-apricot-400"
			aria-hidden="true"
		>
			{data.kind === 'file-large' ? '⚠' : '⊟'}
		</div>
		<h3 class="m-0 text-base font-semibold text-white">
			{#if data.kind === 'file-large'}
				File too large to preview
			{:else}
				Binary file
			{/if}
		</h3>
		<p class="mx-auto mt-1 max-w-md text-sm text-neutral-400">
			{data.name} is {formatSize(data.size)}.
			{#if data.kind === 'file-large'}
				We don't render files larger than 1 MB inline.
			{:else}
				We only render text files inline.
			{/if}
		</p>
		<div class="mt-4">
			<a
				href={`/api/raw/${repoName}/${ref}/${data.path}`}
				class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white no-underline hover:bg-neutral-700"
			>
				Download raw
			</a>
		</div>
	</div>
{/if}
