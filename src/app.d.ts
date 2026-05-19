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

declare module 'sodium-universal' {
	const sodium: any;
	export default sodium;
}

declare module 'b4a' {
	const b4a: any;
	export default b4a;
}

declare module 'hyperdht' {
	const DHT: any;
	export default DHT;
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

declare module 'hypersearch' {
	const Hypersearch: any;
	export default Hypersearch;
}

export {};
