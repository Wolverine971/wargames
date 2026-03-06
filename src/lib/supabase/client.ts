import { browser } from '$app/environment';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { supabaseConfig, supabaseEnabled } from '$lib/supabase/config';

let browserClient: SupabaseClient<Database> | null = null;

export function getBrowserSupabase() {
	if (!browser || !supabaseEnabled) {
		return null;
	}

	browserClient ??= createBrowserClient<Database>(
		supabaseConfig.url,
		supabaseConfig.anonKey
	);

	return browserClient;
}
