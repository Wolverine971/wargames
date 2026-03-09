import type { Feature, FeatureCollection, LineString } from 'geojson';

export interface GridBounds {
	getWest(): number;
	getEast(): number;
	getSouth(): number;
	getNorth(): number;
	getCenter(): {
		lat: number;
	};
}

const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LNG = 111.32;

const round = (value: number) => Number(value.toFixed(6));

const snapDown = (value: number, step: number) => Math.floor(value / step) * step;

export function createKilometerGrid(
	bounds: GridBounds,
	spacingKm: number
): FeatureCollection<LineString> {
	const west = bounds.getWest();
	const east = bounds.getEast();
	const south = bounds.getSouth();
	const north = bounds.getNorth();
	const centerLat = bounds.getCenter().lat;
	const safeCosine = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.15);

	const latStep = spacingKm / KM_PER_DEGREE_LAT;
	const lngStep = spacingKm / (KM_PER_DEGREE_LNG * safeCosine);

	const estimatedLines =
		Math.ceil((north - south) / latStep) + Math.ceil((east - west) / lngStep) + 4;
	if (estimatedLines > 2000) {
		return { type: 'FeatureCollection' as const, features: [] };
	}

	const features: Array<Feature<LineString>> = [];

	for (
		let lat = snapDown(south, latStep);
		lat <= north + latStep;
		lat += latStep
	) {
		const index = Math.round(lat / latStep);
		features.push({
			type: 'Feature',
			geometry: {
				type: 'LineString',
				coordinates: [
					[round(west), round(lat)],
					[round(east), round(lat)]
				]
			},
			properties: {
				axis: 'latitude',
				emphasis: index % 5 === 0 ? 'major' : 'minor'
			}
		});
	}

	for (
		let lng = snapDown(west, lngStep);
		lng <= east + lngStep;
		lng += lngStep
	) {
		const index = Math.round(lng / lngStep);
		features.push({
			type: 'Feature',
			geometry: {
				type: 'LineString',
				coordinates: [
					[round(lng), round(south)],
					[round(lng), round(north)]
				]
			},
			properties: {
				axis: 'longitude',
				emphasis: index % 5 === 0 ? 'major' : 'minor'
			}
		});
	}

	return {
		type: 'FeatureCollection',
		features
	};
}
