import adapter from 'sveltekit-adapter-bare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			window: {
				width: 1200,
				height: 800
			}
		}),
		csrf: { checkOrigin: false }
	}
};

export default config;
