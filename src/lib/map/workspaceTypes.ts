import type { FeatureCollection, Geometry } from 'geojson';

export type UnitMode = 'metric' | 'imperial' | 'nautical';

export type ActiveTool =
	| 'select'
	| 'point'
	| 'group'
	| 'ring'
	| 'route'
	| 'area'
	| 'measure'
	| 'search';

export type RailSection = 'scenario' | 'layers' | 'groups' | 'views' | 'objects';

export type FeatureKind = 'point' | 'route' | 'area' | 'ring' | 'annotation';

export interface DraftView {
	bearing: number;
	center: [number, number];
	pitch: number;
	zoom: number;
}

export interface ScenarioLayer {
	id: string;
	name: string;
	color: string;
	sortOrder: number;
	isVisible: boolean;
	isLocked: boolean;
}

export interface ScenarioGroup {
	id: string;
	name: string;
	color: string;
	description: string;
	isVisible: boolean;
	isLocked: boolean;
}

export interface SavedView {
	id: string;
	name: string;
	view: DraftView;
}

export interface DraftState {
	briefingNotes: string;
	featureCollection: FeatureCollection<Geometry>;
	gridSpacingKm: number;
	gridVisible: boolean;
	scenarioTitle: string;
	view: DraftView;
	layers: ScenarioLayer[];
	groups: ScenarioGroup[];
	savedViews: SavedView[];
	activeLayerId: string | null;
	unitMode: UnitMode;
}

export interface MapFeatureProperties {
	label?: string;
	userColor?: string;
	layerId?: string | null;
	groupId?: string | null;
	featureKind?: FeatureKind;
	radiusMeters?: number;
	sourcePointId?: string | null;
	centerLng?: number;
	centerLat?: number;
	renderVisible?: boolean;
}

export function isMapFeatureProperties(
	value: unknown
): value is MapFeatureProperties {
	return Boolean(value) && typeof value === 'object';
}
