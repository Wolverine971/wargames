import { env } from '$env/dynamic/public';

export const supabaseConfig = {
	url: env.PUBLIC_SUPABASE_URL ?? '',
	anonKey: env.PUBLIC_SUPABASE_ANON_KEY ?? ''
};

export const supabaseEnabled = Boolean(
	supabaseConfig.url && supabaseConfig.anonKey
);
