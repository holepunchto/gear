<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Alert } from '$lib/markdown';

	// A GitHub alert: > [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION].
	const { alert, children }: { alert: Alert; children: Snippet } = $props();

	const STYLE: Record<Alert, { label: string; tone: string }> = {
		note: { label: 'Note', tone: 'border-sky-400 text-sky-300' },
		tip: { label: 'Tip', tone: 'border-emerald-400 text-emerald-300' },
		important: { label: 'Important', tone: 'border-violet-400 text-violet-300' },
		warning: { label: 'Warning', tone: 'border-amber-400 text-amber-300' },
		caution: { label: 'Caution', tone: 'border-red-400 text-red-300' }
	};

	const { label, tone } = $derived(STYLE[alert]);
</script>

<div class="my-5 border-l-[3px] py-0.5 pl-4 {tone} [&>*:last-child]:mb-0">
	<p class="!mt-0 !mb-2 flex items-center gap-2 font-semibold">
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			{#if alert === 'note'}
				<circle cx="12" cy="12" r="10" />
				<path d="M12 16v-4M12 8h.01" />
			{:else if alert === 'tip'}
				<path
					d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
				/>
				<path d="M9 18h6M10 22h4" />
			{:else if alert === 'important'}
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				<path d="M12 7v4M12 15h.01" />
			{:else if alert === 'warning'}
				<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
				<path d="M12 9v4M12 17h.01" />
			{:else}
				<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" />
				<path d="M12 8v4M12 16h.01" />
			{/if}
		</svg>
		{label}
	</p>
	<div class="text-fg-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
		{@render children()}
	</div>
</div>
