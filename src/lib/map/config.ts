import { env } from '$env/dynamic/public';

const fallbackStyle = 'mapbox://styles/mapbox/dark-v11';

export const mapboxConfig = {
	accessToken: env.PUBLIC_MAPBOX_ACCESS_TOKEN ?? '',
	styleUrl: env.PUBLIC_MAPBOX_STYLE_URL || fallbackStyle
};

export const mapboxEnabled = Boolean(mapboxConfig.accessToken);
