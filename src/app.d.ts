// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: import('$lib/server/gip').GipDB;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

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

declare module 'bare-storage' {
	export function persistent(): string;
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

export {};
