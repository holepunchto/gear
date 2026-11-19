<script lang="ts" module>
	type Kind =
		| 'code'
		| 'native'
		| 'json'
		| 'doc'
		| 'license'
		| 'config'
		| 'shell'
		| 'image'
		| 'lock';

	// Quiet tints from the palette. Mint stays for live things (and folders),
	// so code gets apricot and the rest sit near the neutral text tones.
	const TINT: Record<Kind | 'file', string> = {
		code: 'text-apricot-300/75',
		native: 'text-apricot-400/60',
		json: 'text-apricot-200/55',
		doc: 'text-accent-200/50',
		license: 'text-neutral-400',
		config: 'text-fg-3',
		shell: 'text-accent-200/50',
		image: 'text-apricot-200/55',
		lock: 'text-fg-3',
		file: 'text-fg-3'
	};

	const BY_EXT: Record<string, Kind> = {
		js: 'code',
		mjs: 'code',
		cjs: 'code',
		jsx: 'code',
		ts: 'code',
		mts: 'code',
		cts: 'code',
		tsx: 'code',
		c: 'native',
		h: 'native',
		cc: 'native',
		cpp: 'native',
		cxx: 'native',
		hh: 'native',
		hpp: 'native',
		hxx: 'native',
		json: 'json',
		md: 'doc',
		markdown: 'doc',
		sh: 'shell',
		bash: 'shell',
		zsh: 'shell',
		fish: 'shell',
		png: 'image',
		jpg: 'image',
		jpeg: 'image',
		gif: 'image',
		svg: 'image',
		webp: 'image',
		avif: 'image',
		ico: 'image',
		bmp: 'image',
		lock: 'lock',
		lockb: 'lock',
		yml: 'config',
		yaml: 'config',
		toml: 'config',
		ini: 'config'
	};

	const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml']);

	function kindFor(name: string): Kind | 'file' {
		const lower = name.toLowerCase();
		if (LOCKFILES.has(lower)) return 'lock';
		if (/^(readme)(\..*)?$/.test(lower)) return 'doc';
		if (/^(license|licence|notice|copying)(\..*)?$/.test(lower)) return 'license';
		const dot = lower.lastIndexOf('.');
		const kind = dot > 0 ? BY_EXT[lower.slice(dot + 1)] : undefined;
		if (kind) return kind;
		if (lower.startsWith('.')) return 'config';
		return 'file';
	}
</script>

<script lang="ts">
	let { name }: { name: string } = $props();

	const kind = $derived(kindFor(name));
</script>

<svg
	width="18"
	height="18"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={TINT[kind]}
	aria-hidden="true"
>
	{#if kind === 'code'}
		<path d="m8 8-4 4 4 4" />
		<path d="m16 8 4 4-4 4" />
		<path d="m13.5 5-3 14" />
	{:else if kind === 'native'}
		<rect x="6" y="6" width="12" height="12" rx="1.5" />
		<path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
	{:else if kind === 'json'}
		<path
			d="M9 4H8a2 2 0 0 0-2 2v3.5A2.5 2.5 0 0 1 3.5 12 2.5 2.5 0 0 1 6 14.5V18a2 2 0 0 0 2 2h1"
		/>
		<path
			d="M15 4h1a2 2 0 0 1 2 2v3.5a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5V18a2 2 0 0 1-2 2h-1"
		/>
	{:else if kind === 'doc'}
		<path d="M6 3h8l4 4v14H6z" />
		<path d="M14 3v4h4" />
		<path d="M9 12h6M9 16h4" />
	{:else if kind === 'license'}
		<path d="M12 4v16M8 20h8" />
		<path d="M4 7h16" />
		<path d="m6 7-2.5 6a2.5 2.5 0 0 0 5 0z" />
		<path d="m18 7-2.5 6a2.5 2.5 0 0 0 5 0z" />
	{:else if kind === 'config'}
		<path d="M4 7h8M16 7h4M4 17h3M11 17h9" />
		<circle cx="14" cy="7" r="2" />
		<circle cx="9" cy="17" r="2" />
	{:else if kind === 'shell'}
		<path d="m5 7 5 5-5 5" />
		<path d="M12 18h7" />
	{:else if kind === 'image'}
		<rect x="3.5" y="4.5" width="17" height="15" rx="2" />
		<circle cx="9" cy="10" r="1.5" />
		<path d="m20.5 15.5-5-5-9.5 9" />
	{:else if kind === 'lock'}
		<rect x="5" y="10.5" width="14" height="10" rx="2" />
		<path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
	{:else}
		<path d="M6 3h8l4 4v14H6z" />
		<path d="M14 3v4h4" />
	{/if}
</svg>
