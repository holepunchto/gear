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

// Everything that is not a build: the dependency resolution, the source install,
// the release collection — and the updater, which it holds the way pear-runtime
// holds pear-runtime-updater.
declare module 'pear-repo' {
	export type Op = { tag: string; data: Record<string, unknown> };

	export class Updater {
		constructor(config: {
			repo: Repo;
			dir: string;
			upgrade: string;
			name: string;
			version?: string;
			app?: string;
			bundled?: boolean;
			delay?: number;
			updates?: boolean;
			skipUpdate?: ((release: { tag: string; version: string }) => boolean) | null;
		});

		readonly release: { tag: string; version: string; link: string } | null;
		readonly updated: boolean;
		readonly building: boolean;
		readonly nextVersion: string | null;
		ready(): Promise<void>;
		close(): Promise<void>;
		applyUpdate(): Promise<void>;
		check(): Promise<{ tag: string; version: string; link: string } | null>;
		on(event: string, listener: (...args: any[]) => void): this;
	}

	export default class Repo {
		constructor(config?: {
			root?: string;
			dir?: string;
			confirm?: boolean;
			inherit?: boolean;
			toolchain?: Record<string, string>;
			lifecycle?: Record<string, unknown>;
			hosts?: string[];
			out?: string;
			release?: { target?: string | null; prepare?: string | null; config?: string | false };
			label?: string;
			store?: unknown;
			swarm?: unknown;
			bootstrap?: unknown;
			storage?: unknown;
			home?: string;
		});

		ready(): Promise<void>;

		resolve(opts?: { unmet?: string | false }): AsyncIterable<Op>;
		release(opts?: { paths?: string[]; hosts?: string[]; to?: string }): AsyncIterable<Op>;
		make(
			source?: string,
			opts?: {
				hosts?: string[];
				line?: string[];
				ref?: string;
				options?: Record<string, unknown>;
				install?: boolean | string;
			}
		): AsyncIterable<Op>;
		install(source: string, opts?: { to?: string }): AsyncIterable<Op>;
		close(): Promise<void>;

		static Updater: typeof Updater;
		static HOSTS: Record<string, unknown>;
		static current(): string;
		static isLink(source: string): boolean;
		static isPear(spec: string): boolean;
	}
}

declare module 'bare-console/global';
