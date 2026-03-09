import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// This starter currently uses the browser Supabase client only. Eagerly creating
	// the SSR client can schedule auth cookie writes after SvelteKit has finalized the
	// response, which crashes the dev server on the first request.
	event.locals.supabase = null;

	return resolve(event);
};
