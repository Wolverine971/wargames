import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('mapbox-gl') || id.includes('@mapbox/mapbox-gl-draw')) {
						return 'vendor-map';
					}

					if (id.includes('@turf/')) {
						return 'vendor-geo';
					}

					if (id.includes('/mgrs/')) {
						return 'vendor-coordinates';
					}
				}
			}
		}
	}
});
