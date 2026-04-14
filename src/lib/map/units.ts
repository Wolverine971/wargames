import type { UnitMode } from '$lib/map/workspaceTypes';

export type DistanceUnit = 'm' | 'km' | 'mi' | 'nm';

const METERS_PER_KILOMETER = 1000;
const METERS_PER_MILE = 1609.344;
const METERS_PER_NAUTICAL_MILE = 1852;
const SQ_METERS_PER_SQ_KM = 1_000_000;
const SQ_METERS_PER_SQ_MILE = 2_589_988.110336;
const SQ_METERS_PER_SQ_NAUTICAL_MILE = 3_429_904;
const SQ_METERS_PER_ACRE = 4046.8564224;

export const UNIT_MODE_LABELS: Record<UnitMode, string> = {
	metric: 'Metric',
	imperial: 'Imperial',
	nautical: 'Nautical'
};

export function metersFromUnit(value: number, unit: DistanceUnit) {
	switch (unit) {
		case 'm':
			return value;
		case 'km':
			return value * METERS_PER_KILOMETER;
		case 'mi':
			return value * METERS_PER_MILE;
		case 'nm':
			return value * METERS_PER_NAUTICAL_MILE;
	}
}

export function unitFromMeters(meters: number, unit: DistanceUnit) {
	switch (unit) {
		case 'm':
			return meters;
		case 'km':
			return meters / METERS_PER_KILOMETER;
		case 'mi':
			return meters / METERS_PER_MILE;
		case 'nm':
			return meters / METERS_PER_NAUTICAL_MILE;
	}
}

export function formatDistance(meters: number, unitMode: UnitMode, digits = 1) {
	if (!Number.isFinite(meters)) {
		return '0';
	}

	if (unitMode === 'metric') {
		if (Math.abs(meters) >= METERS_PER_KILOMETER) {
			return `${(meters / METERS_PER_KILOMETER).toFixed(digits)} km`;
		}

		return `${meters.toFixed(0)} m`;
	}

	if (unitMode === 'imperial') {
		if (Math.abs(meters) >= METERS_PER_MILE) {
			return `${(meters / METERS_PER_MILE).toFixed(digits)} mi`;
		}

		return `${(meters * 3.28084).toFixed(0)} ft`;
	}

	if (Math.abs(meters) >= METERS_PER_NAUTICAL_MILE) {
		return `${(meters / METERS_PER_NAUTICAL_MILE).toFixed(digits)} nm`;
	}

	return `${meters.toFixed(0)} m`;
}

export function formatRadius(meters: number, unitMode: UnitMode, digits = 1) {
	return `${formatDistance(meters, unitMode, digits)} radius`;
}

export function formatArea(squareMeters: number, unitMode: UnitMode, digits = 2) {
	if (!Number.isFinite(squareMeters)) {
		return '0';
	}

	if (unitMode === 'metric') {
		if (Math.abs(squareMeters) >= SQ_METERS_PER_SQ_KM) {
			return `${(squareMeters / SQ_METERS_PER_SQ_KM).toFixed(digits)} sq km`;
		}

		return `${squareMeters.toFixed(0)} sq m`;
	}

	if (unitMode === 'imperial') {
		if (Math.abs(squareMeters) >= SQ_METERS_PER_SQ_MILE) {
			return `${(squareMeters / SQ_METERS_PER_SQ_MILE).toFixed(digits)} sq mi`;
		}

		return `${(squareMeters / SQ_METERS_PER_ACRE).toFixed(digits)} acres`;
	}

	return `${(squareMeters / SQ_METERS_PER_SQ_NAUTICAL_MILE).toFixed(digits)} sq nm`;
}
