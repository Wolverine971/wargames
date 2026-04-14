import area from '@turf/area';
import length from '@turf/length';
import * as mgrs from 'mgrs';
import type { Feature, LineString, Point, Polygon } from 'geojson';
import { formatArea, formatDistance, formatRadius } from '$lib/map/units';
import type { MapFeatureProperties, UnitMode } from '$lib/map/workspaceTypes';

export interface FeatureSummary {
	id: string;
	label: string;
	kind: 'Point' | 'Route' | 'Area' | 'Ring';
	metric: string;
	detail: string;
	distanceMeters: number;
	areaSqMeters: number;
	radiusMeters: number;
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

function getFeatureProperties(feature: Feature<Point | LineString | Polygon>) {
	return (feature.properties ?? {}) as MapFeatureProperties;
}

export function summarizeFeature(
	feature: Feature<Point | LineString | Polygon>,
	index: number,
	unitMode: UnitMode
): FeatureSummary {
	const fallbackLabel = `Object ${index + 1}`;
	const properties = getFeatureProperties(feature);
	const label =
		typeof properties.label === 'string' && properties.label.length > 0
			? properties.label
			: fallbackLabel;

	if (feature.geometry.type === 'Point') {
		const [lng, lat] = feature.geometry.coordinates;

		return {
			id: String(feature.id ?? `point-${index}`),
			label,
			kind: 'Point',
			metric: `${formatLat(lat)} · ${formatLng(lng)}`,
			detail: formatMgrs(lng, lat),
			distanceMeters: 0,
			areaSqMeters: 0,
			radiusMeters: 0
		};
	}

	if (feature.geometry.type === 'LineString') {
		const distanceMeters = length(feature, { units: 'kilometers' }) * 1000;

		return {
			id: String(feature.id ?? `line-${index}`),
			label,
			kind: 'Route',
			metric: formatDistance(distanceMeters, unitMode, 2),
			detail: `${feature.geometry.coordinates.length} vertices`,
			distanceMeters,
			areaSqMeters: 0,
			radiusMeters: 0
		};
	}

	if (properties.featureKind === 'ring' && typeof properties.radiusMeters === 'number') {
		const areaSqMeters = area(feature);

		return {
			id: String(feature.id ?? `ring-${index}`),
			label,
			kind: 'Ring',
			metric: formatRadius(properties.radiusMeters, unitMode, 2),
			detail: `${formatDistance(properties.radiusMeters * 2, unitMode, 2)} diameter`,
			distanceMeters: 0,
			areaSqMeters,
			radiusMeters: properties.radiusMeters
		};
	}

	const areaSqMeters = area(feature);

	return {
		id: String(feature.id ?? `polygon-${index}`),
		label,
		kind: 'Area',
		metric: formatArea(areaSqMeters, unitMode, 2),
		detail: `${feature.geometry.coordinates[0]?.length ?? 0} perimeter vertices`,
		distanceMeters: 0,
		areaSqMeters,
		radiusMeters: 0
	};
}
