declare module 'brittle' {
	export default function test(name: string, fn: (t: any) => unknown): void;
}

declare module 'z32' {
	const z32: any;
	export default z32;
}

declare module 'corestore' {
	const Corestore: any;
	export default Corestore;
}

declare module 'hyperbee2' {
	const Hyperbee: any;
	export default Hyperbee;
}
