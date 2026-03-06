import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';
import type { Database } from '$lib/types/database';
import { supabaseConfig, supabaseEnabled } from '$lib/supabase/config';

export function createSupabaseServerClient(event: RequestEvent) {
	if (!supabaseEnabled) {
		return null;
	}

	return createServerClient<Database>(
		supabaseConfig.url,
		supabaseConfig.anonKey,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					for (const { name, value, options } of cookiesToSet) {
						event.cookies.set(name, value, {
							...options,
							path: '/'
						});
					}
				}
			}
		}
	);
}
