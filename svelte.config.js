import adapter from '@sveltejs/adapter-static'; // Changed from adapter-auto
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// default options are shown
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true
		}),
		// Add this paths configuration
		paths: {
			base: process.env.NODE_ENV === 'production' ? '/dependency-visualizer' : ''
		},
		// For SvelteKit 2.x, simply set to true to prerender all routes
		prerender: {
			handleMissingId: 'ignore'
		}
	}
};

export default config;
