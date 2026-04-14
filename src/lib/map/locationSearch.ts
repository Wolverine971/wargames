export const SEARCHABLE_FEATURE_TYPES = [
	'country',
	'region',
	'district',
	'place',
	'locality',
	'neighborhood'
] as const;

export type SearchableFeatureType = (typeof SEARCHABLE_FEATURE_TYPES)[number];

export interface LocationSearchSuggestion {
	id: string;
	featureType: string;
	name: string;
	subtitle: string;
	fullName: string;
	center: [number, number];
	bbox?: [number, number, number, number];
	countryCode?: string;
}

interface SearchAdministrativeLocationsParams {
	accessToken: string;
	limit?: number;
	language?: string;
	proximity?: [number, number] | null;
	query: string;
	signal?: AbortSignal;
}

interface MapboxContextEntry {
	country_code?: string;
	name?: string;
}

interface MapboxFeatureProperties {
	context?: {
		country?: MapboxContextEntry;
		district?: MapboxContextEntry;
		locality?: MapboxContextEntry;
		neighborhood?: MapboxContextEntry;
		place?: MapboxContextEntry;
		region?: MapboxContextEntry;
	};
	country_code?: string;
	feature_type?: string;
	full_address?: string;
	mapbox_id?: string;
	name?: string;
	name_preferred?: string;
	place_formatted?: string;
}

interface MapboxFeature {
	bbox?: [number, number, number, number];
	geometry?: {
		coordinates?: [number, number];
	};
	id?: string;
	properties?: MapboxFeatureProperties;
}

interface MapboxFeatureCollectionResponse {
	features?: MapboxFeature[];
	message?: string;
}

const FEATURE_TYPE_WEIGHT: Record<string, number> = {
	country: 5,
	region: 6,
	district: 4,
	place: 3,
	locality: 2,
	neighborhood: 1
};

function normalizeQuery(value: string) {
	return value.trim().toLocaleLowerCase();
}

function toTitleCase(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildSubtitle(feature: MapboxFeature) {
	const properties = feature.properties;
	if (!properties) {
		return '';
	}

	if (typeof properties.place_formatted === 'string' && properties.place_formatted.length > 0) {
		return properties.place_formatted;
	}

	if (typeof properties.full_address === 'string' && properties.full_address.length > 0) {
		return properties.full_address;
	}

	const name = properties.name_preferred ?? properties.name ?? '';
	const context = properties.context ?? {};
	const contextParts = [
		context.neighborhood?.name,
		context.locality?.name,
		context.place?.name,
		context.district?.name,
		context.region?.name,
		context.country?.name
	].filter((part): part is string => Boolean(part) && part !== name);

	return contextParts.join(', ');
}

function normalizeFeature(feature: MapboxFeature): LocationSearchSuggestion | null {
	const coordinates = feature.geometry?.coordinates;
	const properties = feature.properties;
	const name = properties?.name_preferred ?? properties?.name;
	if (!coordinates || !properties || !name) {
		return null;
	}

	const subtitle = buildSubtitle(feature);
	const fullName = subtitle ? `${name}, ${subtitle}` : name;

	return {
		id: properties.mapbox_id ?? feature.id ?? fullName,
		featureType: properties.feature_type ?? 'place',
		name,
		subtitle,
		fullName,
		center: coordinates,
		bbox: feature.bbox,
		countryCode: properties.context?.country?.country_code ?? properties.country_code
	};
}

function getSuggestionRank(suggestion: LocationSearchSuggestion, query: string, index: number) {
	const normalizedQuery = normalizeQuery(query);
	const normalizedName = normalizeQuery(suggestion.name);
	const normalizedFullName = normalizeQuery(suggestion.fullName);
	const wordPrefixMatch = normalizedFullName
		.split(/[,\s/()-]+/)
		.some((token) => token.startsWith(normalizedQuery));

	return {
		exact: normalizedName === normalizedQuery ? 1 : 0,
		prefix: normalizedName.startsWith(normalizedQuery) ? 1 : 0,
		wordPrefix: wordPrefixMatch ? 1 : 0,
		featureWeight: FEATURE_TYPE_WEIGHT[suggestion.featureType] ?? 0,
		index
	};
}

function sortSuggestions(
	suggestions: LocationSearchSuggestion[],
	query: string
): LocationSearchSuggestion[] {
	return suggestions
		.map((suggestion, index) => ({
			suggestion,
			rank: getSuggestionRank(suggestion, query, index)
		}))
		.sort((left, right) => {
			if (left.rank.exact !== right.rank.exact) {
				return right.rank.exact - left.rank.exact;
			}

			if (left.rank.prefix !== right.rank.prefix) {
				return right.rank.prefix - left.rank.prefix;
			}

			if (left.rank.wordPrefix !== right.rank.wordPrefix) {
				return right.rank.wordPrefix - left.rank.wordPrefix;
			}

			if (left.rank.featureWeight !== right.rank.featureWeight) {
				return right.rank.featureWeight - left.rank.featureWeight;
			}

			return left.rank.index - right.rank.index;
		})
		.map((entry) => entry.suggestion);
}

export function formatFeatureTypeLabel(value: string) {
	return toTitleCase(value.replace(/_/g, ' '));
}

export async function searchAdministrativeLocations({
	accessToken,
	limit = 8,
	language = 'en,zh_Hans',
	proximity = null,
	query,
	signal
}: SearchAdministrativeLocationsParams): Promise<LocationSearchSuggestion[]> {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		return [];
	}

	const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
	url.searchParams.set('q', trimmedQuery);
	url.searchParams.set('access_token', accessToken);
	url.searchParams.set('autocomplete', 'true');
	url.searchParams.set('limit', String(limit));
	url.searchParams.set('language', language);
	url.searchParams.set('types', SEARCHABLE_FEATURE_TYPES.join(','));

	if (proximity) {
		url.searchParams.set('proximity', `${proximity[0]},${proximity[1]}`);
	}

	const response = await fetch(url, { signal });
	if (!response.ok) {
		const errorPayload = (await response.json().catch(() => null)) as
			| MapboxFeatureCollectionResponse
			| null;
		throw new Error(errorPayload?.message || `Location search failed with ${response.status}.`);
	}

	const payload = (await response.json()) as MapboxFeatureCollectionResponse;
	const normalized = (payload.features ?? [])
		.map((feature) => normalizeFeature(feature))
		.filter((feature): feature is LocationSearchSuggestion => feature !== null);

	return sortSuggestions(normalized, trimmedQuery);
}
