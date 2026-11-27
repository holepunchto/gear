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

export {};
