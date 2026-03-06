import area from '@turf/area';
import length from '@turf/length';
import * as mgrs from 'mgrs';
import type { Feature, LineString, Point, Polygon } from 'geojson';

export interface FeatureSummary {
	id: string;
	label: string;
	kind: 'Point' | 'Line' | 'Polygon';
	metric: string;
	detail: string;
	distanceKm: number;
	areaSqKm: number;
}

const formatCoordinate = (value: number, positive: string, negative: string) =>
	`${Math.abs(value).toFixed(5)}°${value >= 0 ? positive : negative}`;

export const formatLat = (value: number) => formatCoordinate(value, 'N', 'S');

export const formatLng = (value: number) => formatCoordinate(value, 'E', 'W');

export const formatMgrs = (lng: number, lat: number) => {
	try {
		return mgrs.forward([lng, lat], 5);
	} catch {
		return 'OUTSIDE MGRS';
	}
};

export function summarizeFeature(
	feature: Feature<Point | LineString | Polygon>,
	index: number
): FeatureSummary {
	const fallbackLabel = `Object ${index + 1}`;
	const label =
		typeof feature.properties?.label === 'string' && feature.properties.label.length > 0
			? feature.properties.label
			: fallbackLabel;

	if (feature.geometry.type === 'Point') {
		const [lng, lat] = feature.geometry.coordinates;

		return {
			id: String(feature.id ?? `point-${index}`),
			label,
			kind: 'Point',
			metric: `${formatLat(lat)} · ${formatLng(lng)}`,
			detail: formatMgrs(lng, lat),
			distanceKm: 0,
			areaSqKm: 0
		};
	}

	if (feature.geometry.type === 'LineString') {
		const distanceKm = length(feature, { units: 'kilometers' });

		return {
			id: String(feature.id ?? `line-${index}`),
			label,
			kind: 'Line',
			metric: `${distanceKm.toFixed(2)} km`,
			detail: `${feature.geometry.coordinates.length} vertices`,
			distanceKm,
			areaSqKm: 0
		};
	}

	const areaSqKm = area(feature) / 1_000_000;

	return {
		id: String(feature.id ?? `polygon-${index}`),
		label,
		kind: 'Polygon',
		metric: `${areaSqKm.toFixed(2)} sq km`,
		detail: `${feature.geometry.coordinates[0]?.length ?? 0} perimeter vertices`,
		distanceKm: 0,
		areaSqKm
	};
}
