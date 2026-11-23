declare module 'b4a' {
	const b4a: any;
	export default b4a;
}

declare module 'hypercore-id-encoding' {
	const hid: any;
	export default hid;
}

declare module 'blind-peering' {
	const BlindPeering: any;
	export default BlindPeering;
}

declare module 'protomux-wakeup' {
	const Wakeup: any;
	export default Wakeup;
}

declare module 'hyperconf' {
	const Hyperconf: any;
	export default Hyperconf;
}

declare module 'pear-repo-updater' {
	const PearRepoUpdater: any;
	export default PearRepoUpdater;
}

declare module 'hyperbee2' {
	const Hyperbee: any;
	export default Hyperbee;
}

declare module 'corestore' {
	const Corestore: any;
	export default Corestore;
}

declare module 'z32' {
	const z32: any;
	export default z32;
}

declare module 'brittle' {
	type TestFn = (t: any) => void | Promise<void>;
	interface Test {
		(name: string, fn: TestFn): Promise<void>;
		(name: string, opts: Record<string, unknown>, fn: TestFn): Promise<void>;
		solo: Test;
		skip: Test;
		todo: Test;
		configure(opts: Record<string, unknown>): void;
	}
	const test: Test;
	export default test;
	export { test };
}

declare module 'bare-storage' {
	export function persistent(): string;
}

declare module 'which-runtime' {
	export const isBare: boolean;
	export const isAndroid: boolean;
	export const isIOS: boolean;
	export const isWindows: boolean;
	export const platform: string;
}

declare module 'gip-remote/git' {
	export const treeEntries: any;
}

declare module 'sveltekit-adapter-bare' {
	const adapter: any;
	export default adapter;
	export const vitePlugin: any;
}

// The ../pear-install checkout, which has the source-install path the published
// package does not. pear-repo-updater asks for `pear-install` by name and npm
// dedupes it to this one, so the app and the updater share a single copy.
declare module 'pear-install' {
	export default class Install {
		constructor(opts: { link: string; to?: string; interactive?: boolean; ref?: string });
		ready(): Promise<void>;
		close(): Promise<void>;
		on(event: string, listener: (data: Record<string, unknown>) => void): this;
	}
}

declare module 'bare-console/global';
