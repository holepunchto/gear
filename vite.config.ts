import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePlugin as bareExternals } from 'sveltekit-adapter-bare';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), bareExternals()],
	ssr: {
		// gip-transport brings in the whole hypercore / sodium-native tree. It's
		// CJS-native and has bare-* subpath imports that aren't meant to be
		// bundled. Keep it external so bare resolves it from node_modules at
		// runtime — matches what the adapter's esbuild step already does.
		external: [
			'gip-transport',
			'gip-remote',
			'hyperbee2',
			'hyperdb',
			'hyperdht',
			'hypersearch',
			'sodium-universal',
			'mirror-drive',
			'corestore',
			'bundlebee-import'
		]
	}
});
