import type { Feature, Polygon } from 'geojson';
import type { MapFeatureProperties } from '$lib/map/workspaceTypes';

const WEB_MERCATOR_RADIUS = 6_378_137;

function toRadians(degrees: number) {
	return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
	return (radians * 180) / Math.PI;
}

function normalizeLongitude(longitude: number) {
	return ((((longitude + 540) % 360) + 360) % 360) - 180;
}

function mercatorProject(point: [number, number]) {
	const [lng, lat] = point;
	const constrainedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
	return [
		WEB_MERCATOR_RADIUS * toRadians(lng),
		WEB_MERCATOR_RADIUS *
			Math.log(Math.tan(Math.PI / 4 + toRadians(constrainedLat) / 2))
	] as const;
}

function mercatorUnproject(point: readonly [number, number]): [number, number] {
	const [x, y] = point;
	return [
		normalizeLongitude(toDegrees(x / WEB_MERCATOR_RADIUS)),
		toDegrees(2 * Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS)) - Math.PI / 2)
	];
}

export function createCirclePolygon(
	center: [number, number],
	radiusMeters: number,
	steps = 180
): Polygon {
	const centerProjected = mercatorProject(center);
	const scaleCompensation = 1 / Math.cos(toRadians(center[1]));
	const projectedRadius = radiusMeters * scaleCompensation;
	const coordinates: [number, number][] = [];

	for (let index = 0; index < steps; index += 1) {
		const angle = (2 * Math.PI * index) / steps;
		const x = centerProjected[0] + projectedRadius * Math.cos(angle);
		const y = centerProjected[1] + projectedRadius * Math.sin(angle);
		coordinates.push(mercatorUnproject([x, y]));
	}
	coordinates.push(coordinates[0]);

	return {
		type: 'Polygon',
		coordinates: [coordinates]
	};
}

export function createRingFeature(
	id: string,
	center: [number, number],
	radiusMeters: number,
	label: string,
	properties: MapFeatureProperties = {}
): Feature<Polygon> {
	return {
		type: 'Feature',
		id,
		properties: {
			...properties,
			label,
			featureKind: 'ring',
			radiusMeters,
			centerLng: center[0],
			centerLat: center[1]
		},
		geometry: createCirclePolygon(center, radiusMeters)
	};
}
