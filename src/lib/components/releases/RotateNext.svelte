<script lang="ts">
	import CopyField from './CopyField.svelte';
	import UpgradeLine from './UpgradeLine.svelte';
	import { shortKey, type AppInfo, type KeySummary } from '$lib/releases';

	// Shown on a new key right after rotating to it: who still has to hear
	// about it, and for an app, how installed copies move over.
	let {
		key,
		from,
		app
	}: {
		key: KeySummary;
		from: { key: string; name: string | null; compromised: boolean };
		app: AppInfo | null;
	} = $props();

	const old = $derived(from.name ?? shortKey(from.key));
	const pointsAtOld = $derived(app?.upgrade?.includes(from.key) ?? false);
</script>

<section
	aria-label="After rotating"
	class="flex flex-col gap-4 rounded-2xl bg-surface px-5 py-4 ring-1 ring-accent-300/25 ring-inset"
>
	<div class="flex flex-col gap-1">
		<span class="font-display text-lg font-semibold text-fg">
			Rotated from <span class="font-mono text-base">{old}</span>
		</span>
		<span class="text-sm leading-normal text-fg-2">
			This key starts empty. Propose its first release below; its signers inspect and sign it
			themselves.
		</span>
	</div>

	<div class="flex flex-col gap-2">
		<span class="text-sm font-semibold text-fg"
			>Share the new key with anyone using the old one</span
		>
		<span class="text-xs leading-normal text-fg-3">
			Gear can't tell them: the old key is only {from.compromised || !app?.app
				? 'revoked'
				: 'retired'} on this device.
		</span>
		<CopyField value={key.share} label="Copy link" />
	</div>

	{#if app?.app}
		<div class="flex flex-col gap-2">
			<span class="text-sm font-semibold text-fg">Installed copies</span>
			{#if from.compromised}
				<p class="m-0 text-sm leading-normal text-apricot-300" role="alert">
					Installed copies follow <code class="font-mono">upgrade</code> in package.json, but the old
					key is compromised: whoever holds it could sign their own redirect. Don't move them with a release
					on it. Ship a new install, or share the new key directly.
				</p>
			{:else}
				<span class="text-xs leading-normal text-fg-3">
					Installed copies follow <code class="font-mono">upgrade</code> in package.json. To move
					them over, release one more version on
					<a href="/releases/{from.key}" class="font-mono">{old}</a> with this line:
				</span>
				<UpgradeLine link={key.share} />
			{/if}
			{#if pointsAtOld}
				<span class="text-xs text-fg-2">package.json currently points at the old key.</span>
			{/if}
		</div>
	{/if}
</section>
