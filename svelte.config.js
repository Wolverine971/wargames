import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			$map: 'src/lib/map',
			$supabase: 'src/lib/supabase',
			$types: 'src/lib/types'
		}
	}
};

export default config;
