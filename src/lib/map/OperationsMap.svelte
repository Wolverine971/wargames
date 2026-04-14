<svelte:head>
	<title>WarGames Command Map</title>
	<meta
		name="description"
		content="Operational mapping workspace for war game presentations, measurements, and scenario sketching."
	/>
</svelte:head>

<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
	import { onMount } from 'svelte';
	import * as mgrs from 'mgrs';
	import type mapboxgl from 'mapbox-gl';
	import type MapboxDraw from '@mapbox/mapbox-gl-draw';
	import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap } from 'leaflet';
	import type {
		Feature,
		FeatureCollection,
		Geometry,
		LineString,
		Point,
		Polygon
	} from 'geojson';
	import { createKilometerGrid } from '$lib/map/grid';
	import {
		formatLat,
		formatLng,
		formatMgrs,
		summarizeFeature,
		type FeatureSummary
	} from '$lib/map/metrics';
	import LocationSearch from '$lib/map/LocationSearch.svelte';
	import { mapboxConfig, mapboxEnabled } from '$lib/map/config';
	import type { LocationSearchSuggestion } from '$lib/map/locationSearch';
	import { supabaseEnabled } from '$lib/supabase/config';
	import { getBrowserSupabase } from '$lib/supabase/client';
	import TopActionBar from '$lib/map/TopActionBar.svelte';
	import ToolTray from '$lib/map/ToolTray.svelte';
	import RightInspector from '$lib/map/RightInspector.svelte';
	import { createRingFeature } from '$lib/map/rings';
	import { clearDraftState, readDraftState, writeDraftState } from '$lib/map/draftRepository';
	import { formatArea, formatDistance, metersFromUnit } from '$lib/map/units';
	import type {
		ActiveTool,
		DraftState,
		DraftView,
		MapFeatureProperties,
		RailSection,
		SavedView,
		ScenarioGroup,
		ScenarioLayer,
		UnitMode
	} from '$lib/map/workspaceTypes';

	const GRID_SOURCE_ID = 'ops-grid-source';
	const GRID_MAJOR_LAYER_ID = 'ops-grid-major';
	const GRID_MINOR_LAYER_ID = 'ops-grid-minor';
	const RASTER_FALLBACK_STYLE_PATH = 'mapbox/satellite-streets-v12';
	const DEFAULT_LAYER_COLOR = '#77d1ff';
	const DEFAULT_ACCENT_COLOR = '#f8c26d';
	const DEFAULT_SCENARIO_TITLE = 'WarGames Operational Canvas';
	const DEFAULT_BRIEFING_NOTE =
		'Presentation-first scenario board for drawing objectives, measuring approach distances, and building layered briefs.';
	const gridOptions = [1, 5, 10, 25, 50];
	const railSections: Array<{ id: RailSection; label: string }> = [
		{ id: 'scenario', label: 'Scenario' },
		{ id: 'layers', label: 'Layers' },
		{ id: 'groups', label: 'Groups' },
		{ id: 'views', label: 'Views' },
		{ id: 'objects', label: 'Objects' }
	];
	const ringPresets = [
		{ label: '1 mi', value: 1, unit: 'mi' as const },
		{ label: '5 mi', value: 5, unit: 'mi' as const },
		{ label: '10 mi', value: 10, unit: 'mi' as const },
		{ label: '25 km', value: 25, unit: 'km' as const }
	];
	const defaultView = {
		center: [-97.5164, 38.8] as [number, number],
		zoom: 4.2,
		bearing: 0,
		pitch: 0
	};

	let mapHost: HTMLDivElement;
	let leafletModule: typeof import('leaflet') | null = null;
	let map: mapboxgl.Map | null = null;
	let draw: MapboxDraw | null = null;
	let rasterMap: LeafletMap | null = null;
	let rasterGridLayer: LeafletGeoJSON | null = null;
	let rasterFeatureLayer: LeafletGeoJSON | null = null;
	let localFeatureCollection: FeatureCollection<Geometry> = emptyFeatureCollection();

	const defaultLayer = createScenarioLayer('Operational Objects', DEFAULT_LAYER_COLOR);

	let scenarioTitle = DEFAULT_SCENARIO_TITLE;
	let briefingNotes = DEFAULT_BRIEFING_NOTE;
	let gridVisible = true;
	let gridSpacingKm = 5;
	let layers: ScenarioLayer[] = [defaultLayer];
	let groups: ScenarioGroup[] = [];
	let savedViews: SavedView[] = [];
	let activeLayerId = defaultLayer.id;
	let unitMode: UnitMode = 'metric';
	let activeTool: ActiveTool = 'select';
	let activeRailSection: RailSection = 'scenario';

	let pointLabel = '';
	let inputLat = '';
	let inputLng = '';
	let inputMgrs = '';
	let pointRepeatMode = false;

	let ringLabel = '';
	let ringDistanceValue = 10;
	let ringDistanceUnit: 'm' | 'km' | 'mi' | 'nm' = 'km';
	let ringInputMode: 'radius' | 'diameter' = 'radius';
	let ringRepeatMode = false;

	let newLayerName = '';
	let newLayerColor = DEFAULT_LAYER_COLOR;
	let newGroupName = '';
	let newGroupColor = DEFAULT_ACCENT_COLOR;
	let newGroupDescription = '';
	let newSavedViewName = '';

	let featureSummaries: FeatureSummary[] = [];
	let selectedFeatureIds: string[] = [];
	let selectedFeatureId: string | null = null;
	let selectedFeature: Feature<Point | LineString | Polygon> | null = null;
	let pendingPointMoveFeatureId: string | null = null;

	let cursorLng = defaultView.center[0];
	let cursorLat = defaultView.center[1];
	let mapCenterLng = defaultView.center[0];
	let mapCenterLat = defaultView.center[1];
	let lastSavedAt: string | null = null;
	let mapState:
		| 'disabled'
		| 'initializing'
		| 'loading'
		| 'ready'
		| 'fallback'
		| 'error' = mapboxEnabled ? 'initializing' : 'disabled';
	let mapError: string | null = null;
	let mapSurfaceVisible = !mapboxEnabled;

	$: selectionCount = selectedFeatureIds.length;
	$: selectedSummary =
		featureSummaries.find((feature) => feature.id === selectedFeatureId) ?? null;
	$: pointCount = featureSummaries.filter((item) => item.kind === 'Point').length;
	$: routeCount = featureSummaries.filter((item) => item.kind === 'Route').length;
	$: ringCount = featureSummaries.filter((item) => item.kind === 'Ring').length;
	$: areaCount = featureSummaries.filter((item) => item.kind === 'Area').length;
	$: totalDistanceMeters = featureSummaries.reduce(
		(total, item) => total + item.distanceMeters,
		0
	);
	$: totalAreaSqMeters = featureSummaries.reduce(
		(total, item) => total + item.areaSqMeters,
		0
	);
	$: cursorMgrs = formatMgrs(cursorLng, cursorLat);
	$: dataModeLabel = supabaseEnabled ? 'Supabase-ready workspace' : 'Browser draft mode';
	$: canPlotOnMap = Boolean(map || rasterMap);
	$: drawCapable = mapState === 'ready';
	$: locationSearchEnabled = mapboxEnabled && (mapState === 'ready' || mapState === 'fallback');
	$: locationSearchDisabledReason = !mapboxEnabled
		? 'Add a Mapbox token to turn on place search.'
		: mapState === 'loading' || mapState === 'initializing'
			? 'Search activates when the map finishes loading.'
			: mapState === 'error'
				? 'Search is unavailable until the map recovers.'
				: 'Search is unavailable in the current map state.';
	$: supportState =
		mapState === 'ready'
			? 'Mapbox rendering online'
			: mapState === 'fallback'
				? 'Raster fallback map active'
				: mapState === 'loading' || mapState === 'initializing'
					? 'Mapbox loading'
					: mapState === 'error'
						? 'Mapbox failed to initialize'
						: 'Awaiting Mapbox access token';
	$: activeLayer =
		layers.find((layer) => layer.id === activeLayerId) ??
		layers[0] ??
		createScenarioLayer('Operational Objects', DEFAULT_LAYER_COLOR);
	$: selectedFeatureColor = selectedFeature ? getFeatureColor(selectedFeature) : DEFAULT_LAYER_COLOR;
	$: canEditSelectedColor = Boolean(selectedFeature);
	$: selectedPointCoordinates =
		selectedFeature?.geometry.type === 'Point'
			? (selectedFeature.geometry.coordinates as [number, number])
			: null;
	$: pendingPointMove = Boolean(pendingPointMoveFeatureId);
	$: toolTrayTitle = getToolTrayTitle(activeTool);
	$: toolTrayDescription = getToolTrayDescription(activeTool);

	const mapboxDrawStyles = [
		{
			id: 'gl-draw-polygon-fill',
			type: 'fill',
			filter: [
				'all',
				['==', '$type', 'Polygon'],
				['!=', ['get', 'renderVisible'], false]
			],
			paint: {
				'fill-color': ['coalesce', ['get', 'userColor'], DEFAULT_LAYER_COLOR],
				'fill-opacity': [
					'case',
					['==', ['get', 'active'], 'true'],
					0.22,
					0.12
				]
			}
		},
		{
			id: 'gl-draw-polygon-stroke',
			type: 'line',
			filter: [
				'all',
				['==', '$type', 'Polygon'],
				['!=', ['get', 'renderVisible'], false]
			],
			layout: {
				'line-cap': 'round',
				'line-join': 'round'
			},
			paint: {
				'line-color': ['coalesce', ['get', 'userColor'], DEFAULT_LAYER_COLOR],
				'line-dasharray': [
					'case',
					['==', ['get', 'active'], 'true'],
					[0.2, 2],
					[2, 0]
				],
				'line-width': ['case', ['==', ['get', 'active'], 'true'], 3, 2]
			}
		},
		{
			id: 'gl-draw-line',
			type: 'line',
			filter: [
				'all',
				['==', '$type', 'LineString'],
				['!=', ['get', 'renderVisible'], false]
			],
			layout: {
				'line-cap': 'round',
				'line-join': 'round'
			},
			paint: {
				'line-color': ['coalesce', ['get', 'userColor'], DEFAULT_LAYER_COLOR],
				'line-dasharray': [
					'case',
					['==', ['get', 'active'], 'true'],
					[0.2, 2],
					[2, 0]
				],
				'line-width': 2
			}
		},
		{
			id: 'gl-draw-point-outer',
			type: 'circle',
			filter: [
				'all',
				['==', '$type', 'Point'],
				['==', 'meta', 'feature'],
				['!=', ['get', 'renderVisible'], false]
			],
			paint: {
				'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 7, 5],
				'circle-color': '#ffffff'
			}
		},
		{
			id: 'gl-draw-point-inner',
			type: 'circle',
			filter: [
				'all',
				['==', '$type', 'Point'],
				['==', 'meta', 'feature'],
				['!=', ['get', 'renderVisible'], false]
			],
			paint: {
				'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 5, 3],
				'circle-color': ['coalesce', ['get', 'userColor'], DEFAULT_LAYER_COLOR]
			}
		},
		{
			id: 'gl-draw-vertex-outer',
			type: 'circle',
			filter: [
				'all',
				['==', '$type', 'Point'],
				['==', 'meta', 'vertex'],
				['!=', 'mode', 'simple_select']
			],
			paint: {
				'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 7, 5],
				'circle-color': '#ffffff'
			}
		},
		{
			id: 'gl-draw-vertex-inner',
			type: 'circle',
			filter: [
				'all',
				['==', '$type', 'Point'],
				['==', 'meta', 'vertex'],
				['!=', 'mode', 'simple_select']
			],
			paint: {
				'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 5, 3],
				'circle-color': DEFAULT_ACCENT_COLOR
			}
		},
		{
			id: 'gl-draw-midpoint',
			type: 'circle',
			filter: [['all', ['==', 'meta', 'midpoint']]],
			paint: {
				'circle-radius': 3,
				'circle-color': DEFAULT_ACCENT_COLOR
			}
		}
	];

	function emptyFeatureCollection(): FeatureCollection<Geometry> {
		return {
			type: 'FeatureCollection',
			features: []
		};
	}

	function createRecordId() {
		return (
			globalThis.crypto?.randomUUID?.() ??
			`record-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
		);
	}

	function createScenarioLayer(name: string, color: string): ScenarioLayer {
		return {
			id: createRecordId(),
			name,
			color,
			sortOrder: 0,
			isVisible: true,
			isLocked: false
		};
	}

	function createScenarioGroup(name: string, color: string): ScenarioGroup {
		return {
			id: createRecordId(),
			name,
			color,
			description: '',
			isVisible: true,
			isLocked: false
		};
	}

	function normalizeHexColor(value: string) {
		return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_LAYER_COLOR;
	}

	function buildPointLabel(point: [number, number], label: string) {
		const trimmedLabel = label.trim();
		return trimmedLabel.length > 0
			? trimmedLabel
			: `${point[1].toFixed(4)}, ${point[0].toFixed(4)}`;
	}

	function getFeatureProperties(
		feature: Feature<Point | LineString | Polygon> | null
	): MapFeatureProperties {
		return ((feature?.properties as MapFeatureProperties | undefined) ?? {}) as MapFeatureProperties;
	}

	function inferFeatureKind(feature: Feature<Point | LineString | Polygon>) {
		const properties = getFeatureProperties(feature);
		if (properties.featureKind) {
			return properties.featureKind;
		}

		if (feature.geometry.type === 'Point') {
			return 'point';
		}

		if (feature.geometry.type === 'LineString') {
			return 'route';
		}

		return 'area';
	}

	function getLayer(layerId: string | null | undefined) {
		if (!layerId) {
			return activeLayer;
		}

		return layers.find((layer) => layer.id === layerId) ?? activeLayer;
	}

	function getGroup(groupId: string | null | undefined) {
		if (!groupId) {
			return null;
		}

		return groups.find((group) => group.id === groupId) ?? null;
	}

	function isFeatureVisibleByIds(layerId: string | null | undefined, groupId: string | null | undefined) {
		const layer = getLayer(layerId);
		if (!layer.isVisible) {
			return false;
		}

		const group = getGroup(groupId);
		return group ? group.isVisible : true;
	}

	function isFeatureVisible(feature: Feature<Point | LineString | Polygon>) {
		const properties = getFeatureProperties(feature);
		return isFeatureVisibleByIds(properties.layerId, properties.groupId);
	}

	function getFeatureColor(feature: Feature<Point | LineString | Polygon>) {
		const properties = getFeatureProperties(feature);
		if (typeof properties.userColor === 'string') {
			return normalizeHexColor(properties.userColor);
		}

		const layer = getLayer(properties.layerId);
		return normalizeHexColor(layer.color);
	}

	function decorateFeature(
		feature: Feature<Point | LineString | Polygon>
	): Feature<Point | LineString | Polygon> {
		const properties = getFeatureProperties(feature);
		const layerId = properties.layerId ?? activeLayerId;
		const featureKind = inferFeatureKind(feature);
		const nextProperties: MapFeatureProperties = {
			...properties,
			layerId,
			featureKind,
			renderVisible: isFeatureVisibleByIds(layerId, properties.groupId)
		} as MapFeatureProperties & { renderVisible?: boolean };

		if (feature.geometry.type !== 'Point') {
			nextProperties.userColor = normalizeHexColor(
				typeof properties.userColor === 'string'
					? properties.userColor
					: getLayer(layerId).color
			);
		}

		return {
			...feature,
			properties: nextProperties
		};
	}

	function refreshSelectedFeature(
		collection: FeatureCollection<Point | LineString | Polygon>
	) {
		selectedFeature =
			collection.features.find((feature) => String(feature.id ?? '') === selectedFeatureId) ??
			null;
	}

	function setSelectedFeatureIds(featureIds: string[]) {
		if (
			pendingPointMoveFeatureId &&
			featureIds.length > 0 &&
			featureIds[0] !== pendingPointMoveFeatureId
		) {
			pendingPointMoveFeatureId = null;
		}

		selectedFeatureIds = featureIds;
		selectedFeatureId = featureIds[0] ?? null;
	}

	function getCurrentFeatureCollection() {
		if (draw) {
			return draw.getAll() as FeatureCollection<Geometry>;
		}

		return localFeatureCollection;
	}

	function replaceFeature(
		featureId: string,
		updater: (
			feature: Feature<Point | LineString | Polygon>
		) => Feature<Point | LineString | Polygon>
	) {
		const collection = getCurrentFeatureCollection() as FeatureCollection<
			Point | LineString | Polygon
		>;
		const existingFeature = collection.features.find(
			(feature) => String(feature.id ?? '') === featureId
		);

		if (!existingFeature) {
			return;
		}

		const updatedFeature = decorateFeature({
			...updater(existingFeature),
			id: existingFeature.id
		});

		if (draw) {
			draw.delete(featureId);
			draw.add(updatedFeature);
			draw.changeMode('simple_select', {
				featureIds: [featureId]
			});
		} else {
			localFeatureCollection = {
				type: 'FeatureCollection',
				features: collection.features.map((feature) =>
					String(feature.id ?? '') === featureId ? updatedFeature : feature
				)
			};
		}

		setSelectedFeatureIds([featureId]);
		applyFeaturePresentationState();
	}

	function getCurrentView(): DraftView {
		const center = map
			? map.getCenter()
			: rasterMap?.getCenter() ?? { lng: defaultView.center[0], lat: defaultView.center[1] };
		const zoom = map ? map.getZoom() : rasterMap?.getZoom() ?? defaultView.zoom;
		const bearing = map ? map.getBearing() : defaultView.bearing;
		const pitch = map ? map.getPitch() : defaultView.pitch;

		return {
			center: [center.lng, center.lat],
			zoom,
			bearing,
			pitch
		};
	}

	function setCurrentView(view: DraftView) {
		if (map) {
			map.jumpTo(view);
		}

		if (rasterMap) {
			rasterMap.setView([view.center[1], view.center[0]], view.zoom);
		}

		mapCenterLng = view.center[0];
		mapCenterLat = view.center[1];
		cursorLng = view.center[0];
		cursorLat = view.center[1];
	}

	function flyToPoint(point: [number, number]) {
		if (map) {
			map.flyTo({
				center: point,
				zoom: Math.max(map.getZoom(), 9)
			});
		}

		if (rasterMap) {
			rasterMap.flyTo([point[1], point[0]], Math.max(rasterMap.getZoom(), 9), {
				duration: 0.75
			});
		}
	}

	function fitToBounds(bounds: [number, number, number, number]) {
		const center: [number, number] = [
			(bounds[0] + bounds[2]) / 2,
			(bounds[1] + bounds[3]) / 2
		];

		if (map) {
			map.fitBounds(
				[
					[bounds[0], bounds[1]],
					[bounds[2], bounds[3]]
				],
				{
					padding: 64,
					maxZoom: 8,
					duration: 1200
				}
			);
		}

		if (rasterMap) {
			rasterMap.fitBounds(
				[
					[bounds[1], bounds[0]],
					[bounds[3], bounds[2]]
				],
				{
					padding: [64, 64],
					maxZoom: 8
				}
			);
		}

		mapCenterLng = center[0];
		mapCenterLat = center[1];
		cursorLng = center[0];
		cursorLat = center[1];
	}

	function handleLocationSelect(event: CustomEvent<LocationSearchSuggestion>) {
		const suggestion = event.detail;
		if (suggestion.bbox) {
			fitToBounds(suggestion.bbox);
			return;
		}

		mapCenterLng = suggestion.center[0];
		mapCenterLat = suggestion.center[1];
		cursorLng = suggestion.center[0];
		cursorLat = suggestion.center[1];
		flyToPoint(suggestion.center);
	}

	function setLastSaved() {
		lastSavedAt = new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date());
	}

	function revealMapSurface() {
		requestAnimationFrame(() => {
			mapSurfaceVisible = true;
		});
	}

	function applyFeaturePresentationState(persist = true) {
		if (draw) {
			const collection = draw.getAll() as FeatureCollection<Point | LineString | Polygon>;
			for (const feature of collection.features) {
				if (!feature.id) {
					continue;
				}

				const decorated = decorateFeature(feature);
				const properties = getFeatureProperties(decorated);
				for (const [key, value] of Object.entries(properties)) {
					draw.setFeatureProperty(String(feature.id), key, value);
				}
			}
		} else {
			localFeatureCollection = {
				type: 'FeatureCollection',
				features: localFeatureCollection.features.map((feature) =>
					decorateFeature(feature as Feature<Point | LineString | Polygon>)
				)
			};
		}

		if (rasterMap) {
			renderFallbackFeatures();
		}

		syncFeatureState(persist);
	}

	function normalizeLayers(nextLayers: ScenarioLayer[] | undefined) {
		if (Array.isArray(nextLayers) && nextLayers.length > 0) {
			return nextLayers.map((layer, index) => ({
				...layer,
				color: normalizeHexColor(layer.color),
				sortOrder: layer.sortOrder ?? index
			}));
		}

		return [createScenarioLayer('Operational Objects', DEFAULT_LAYER_COLOR)];
	}

	function applyDraftState(
		draftState: DraftState,
		{ restoreView = true }: { restoreView?: boolean } = {}
	) {
		scenarioTitle = draftState.scenarioTitle || DEFAULT_SCENARIO_TITLE;
		briefingNotes = draftState.briefingNotes || DEFAULT_BRIEFING_NOTE;
		gridVisible = draftState.gridVisible ?? true;
		gridSpacingKm = draftState.gridSpacingKm ?? 5;
		layers = normalizeLayers(draftState.layers);
		groups = Array.isArray(draftState.groups) ? draftState.groups : [];
		savedViews = Array.isArray(draftState.savedViews) ? draftState.savedViews : [];
		activeLayerId =
			layers.find((layer) => layer.id === draftState.activeLayerId)?.id ?? layers[0].id;
		unitMode = draftState.unitMode ?? 'metric';
		localFeatureCollection = {
			type: 'FeatureCollection',
			features: (draftState.featureCollection?.features ?? []).map((feature) =>
				decorateFeature(feature as Feature<Point | LineString | Polygon>)
			)
		};

		if (restoreView) {
			setCurrentView(draftState.view ?? defaultView);
		} else {
			const view = draftState.view ?? defaultView;
			mapCenterLng = view.center[0];
			mapCenterLat = view.center[1];
			cursorLng = view.center[0];
			cursorLat = view.center[1];
		}

		if (draw) {
			draw.deleteAll();
			if (localFeatureCollection.features.length > 0) {
				draw.add(localFeatureCollection);
			}
		}

		applyFeaturePresentationState(false);
		updateGridLayer();
		setLastSaved();
	}

	function getDraftState(): DraftState | null {
		if (!map && !rasterMap) {
			return null;
		}

		return {
			scenarioTitle,
			briefingNotes,
			gridVisible,
			gridSpacingKm,
			featureCollection: getCurrentFeatureCollection(),
			view: getCurrentView(),
			layers,
			groups,
			savedViews,
			activeLayerId,
			unitMode
		};
	}

	function persistDraft() {
		const nextDraft = getDraftState();
		if (!nextDraft) {
			return;
		}

		writeDraftState(nextDraft);
		setLastSaved();
	}

	function buildMapboxGridLayers() {
		if (!map || !map.isStyleLoaded() || map.getSource(GRID_SOURCE_ID)) {
			return;
		}

		const bounds = map.getBounds();
		if (!bounds) {
			return;
		}

		map.addSource(GRID_SOURCE_ID, {
			type: 'geojson',
			data: createKilometerGrid(bounds, gridSpacingKm)
		});

		map.addLayer({
			id: GRID_MINOR_LAYER_ID,
			type: 'line',
			source: GRID_SOURCE_ID,
			filter: ['==', ['get', 'emphasis'], 'minor'],
			layout: {
				visibility: gridVisible ? 'visible' : 'none'
			},
			paint: {
				'line-color': '#3e6b8a',
				'line-width': 1,
				'line-opacity': 0.35
			}
		});

		map.addLayer({
			id: GRID_MAJOR_LAYER_ID,
			type: 'line',
			source: GRID_SOURCE_ID,
			filter: ['==', ['get', 'emphasis'], 'major'],
			layout: {
				visibility: gridVisible ? 'visible' : 'none'
			},
			paint: {
				'line-color': '#77d1ff',
				'line-width': 1.2,
				'line-opacity': 0.58
			}
		});
	}

	function updateMapboxGridLayer() {
		if (!map || !map.isStyleLoaded()) {
			return;
		}

		const bounds = map.getBounds();
		if (!bounds) {
			return;
		}

		const source = map.getSource(GRID_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
		const visibility = gridVisible ? 'visible' : 'none';

		if (source) {
			source.setData(createKilometerGrid(bounds, gridSpacingKm));
		}

		if (map.getLayer(GRID_MINOR_LAYER_ID)) {
			map.setLayoutProperty(GRID_MINOR_LAYER_ID, 'visibility', visibility);
		}

		if (map.getLayer(GRID_MAJOR_LAYER_ID)) {
			map.setLayoutProperty(GRID_MAJOR_LAYER_ID, 'visibility', visibility);
		}
	}

	function getRenderableFeatureCollection() {
		return {
			type: 'FeatureCollection',
			features: localFeatureCollection.features.filter((feature) =>
				isFeatureVisible(feature as Feature<Point | LineString | Polygon>)
			)
		} as FeatureCollection<Point | LineString | Polygon>;
	}

	function renderFallbackFeatures() {
		if (!leafletModule || !rasterMap) {
			return;
		}

		rasterFeatureLayer?.remove();
		rasterFeatureLayer = leafletModule
			.geoJSON(getRenderableFeatureCollection(), {
				pointToLayer: (feature, latlng) =>
					leafletModule!.circleMarker(latlng, {
						radius: 7,
						color: '#ffffff',
						weight: 2,
						fillColor: getFeatureColor(feature as Feature<Point | LineString | Polygon>),
						fillOpacity: 0.92
					}),
				style: (feature) => {
					const typedFeature = feature as Feature<Point | LineString | Polygon>;
					const color = getFeatureColor(typedFeature);
					if (feature?.geometry.type === 'Polygon') {
						return {
							color,
							weight: 2,
							fillColor: color,
							fillOpacity: getFeatureProperties(typedFeature).featureKind === 'ring' ? 0.08 : 0.14
						};
					}

					return {
						color,
						weight: 3,
						opacity: 0.9
					};
				},
				onEachFeature: (feature, layer) => {
					const label =
						typeof feature.properties?.label === 'string' ? feature.properties.label : '';
					if (label) {
						layer.bindTooltip(label, {
							direction: 'top',
							offset: [0, -8]
						});
					}

					layer.on('click', () => {
						setSelectedFeatureIds([String(feature.id ?? '')]);
						syncFeatureState(false);
					});
				}
			})
			.addTo(rasterMap);

		rasterFeatureLayer.bringToFront();
	}

	function updateFallbackGridLayer() {
		if (!leafletModule || !rasterMap) {
			return;
		}

		rasterGridLayer?.remove();
		rasterGridLayer = null;

		if (!gridVisible) {
			return;
		}

		rasterGridLayer = leafletModule
			.geoJSON(createKilometerGrid(rasterMap.getBounds(), gridSpacingKm), {
				style: (feature) => ({
					color: feature?.properties?.emphasis === 'major' ? '#77d1ff' : '#3e6b8a',
					weight: feature?.properties?.emphasis === 'major' ? 1.2 : 1,
					opacity: feature?.properties?.emphasis === 'major' ? 0.58 : 0.35
				})
			})
			.addTo(rasterMap);

		rasterGridLayer.bringToFront();
		rasterFeatureLayer?.bringToFront();
	}

	function updateGridLayer() {
		updateMapboxGridLayer();
		updateFallbackGridLayer();
	}

	function syncFeatureState(persist = true) {
		const collection = getCurrentFeatureCollection() as FeatureCollection<
			Point | LineString | Polygon
		>;
		featureSummaries = collection.features.map((feature, index) =>
			summarizeFeature(feature, index, unitMode)
		);

		const availableIds = new Set(featureSummaries.map((feature) => feature.id));
		selectedFeatureIds = selectedFeatureIds.filter((featureId) => availableIds.has(featureId));
		if (selectedFeatureIds.length === 0 && selectedFeatureId && availableIds.has(selectedFeatureId)) {
			selectedFeatureIds = [selectedFeatureId];
		}
		selectedFeatureId = selectedFeatureIds[0] ?? null;
		refreshSelectedFeature(collection);

		if (rasterMap) {
			renderFallbackFeatures();
		}

		if (persist) {
			persistDraft();
		}
	}

	function setGridSpacing(nextSpacing: number) {
		gridSpacingKm = nextSpacing;
		updateGridLayer();
		persistDraft();
	}

	function toggleGridVisibility() {
		gridVisible = !gridVisible;
		updateGridLayer();
		persistDraft();
	}

	function setUnitMode(nextUnitMode: UnitMode) {
		unitMode = nextUnitMode;
		syncFeatureState(false);
		persistDraft();
	}

	function focusFeature(summaryId: string) {
		setSelectedFeatureIds([summaryId]);
		const collection = getCurrentFeatureCollection() as FeatureCollection<
			Point | LineString | Polygon
		>;
		refreshSelectedFeature(collection);

		if (draw) {
			draw.changeMode('simple_select', {
				featureIds: [summaryId]
			});
		}

		const feature = collection.features.find((nextFeature) => String(nextFeature.id) === summaryId);
		if (feature) {
			const geometry = feature.geometry;
			const point =
				geometry.type === 'Point'
					? (geometry.coordinates as [number, number])
					: geometry.type === 'LineString'
						? (geometry.coordinates[0] as [number, number])
						: (geometry.coordinates[0]?.[0] as [number, number]);
			if (point) {
				flyToPoint(point);
			}
		}
	}

	function patchLocalFeatures(
		featureIds: string[],
		patch:
			| Partial<MapFeatureProperties>
			| ((feature: Feature<Point | LineString | Polygon>) => Partial<MapFeatureProperties>)
	) {
		localFeatureCollection = {
			type: 'FeatureCollection',
			features: localFeatureCollection.features.map((feature) => {
				if (!featureIds.includes(String(feature.id ?? ''))) {
					return feature;
				}

				const typedFeature = feature as Feature<Point | LineString | Polygon>;
				const nextPatch = typeof patch === 'function' ? patch(typedFeature) : patch;
				return {
					...typedFeature,
					properties: {
						...getFeatureProperties(typedFeature),
						...nextPatch
					}
				};
			})
		};
	}

	function patchFeatureProperties(
		featureIds: string[],
		patch:
			| Partial<MapFeatureProperties>
			| ((feature: Feature<Point | LineString | Polygon>) => Partial<MapFeatureProperties>)
	) {
		if (featureIds.length === 0) {
			return;
		}

		if (draw) {
			const collection = draw.getAll() as FeatureCollection<Point | LineString | Polygon>;
			for (const feature of collection.features) {
				const featureId = String(feature.id ?? '');
				if (!featureIds.includes(featureId)) {
					continue;
				}

				const nextPatch = typeof patch === 'function' ? patch(feature) : patch;
				for (const [key, value] of Object.entries(nextPatch)) {
					draw.setFeatureProperty(featureId, key, value);
				}
			}
		} else {
			patchLocalFeatures(featureIds, patch);
		}

		applyFeaturePresentationState();
	}

	function getRingCenter(feature: Feature<Point | LineString | Polygon>) {
		const properties = getFeatureProperties(feature);
		if (
			typeof properties.centerLng === 'number' &&
			typeof properties.centerLat === 'number'
		) {
			return [properties.centerLng, properties.centerLat] as [number, number];
		}

		if (feature.geometry.type !== 'Polygon') {
			return null;
		}

		const ring = feature.geometry.coordinates[0] ?? [];
		if (ring.length === 0) {
			return null;
		}

		let minLng = ring[0][0];
		let maxLng = ring[0][0];
		let minLat = ring[0][1];
		let maxLat = ring[0][1];

		for (const [lng, lat] of ring) {
			minLng = Math.min(minLng, lng);
			maxLng = Math.max(maxLng, lng);
			minLat = Math.min(minLat, lat);
			maxLat = Math.max(maxLat, lat);
		}

		return [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number];
	}

	function deleteSelectedFeatures() {
		const nextSelectedIds = [...selectedFeatureIds];
		if (nextSelectedIds.length === 0) {
			return;
		}

		if (draw) {
			draw.delete(nextSelectedIds);
		} else {
			localFeatureCollection = {
				type: 'FeatureCollection',
				features: localFeatureCollection.features.filter(
					(feature) => !nextSelectedIds.includes(String(feature.id ?? ''))
				)
			};
		}

		setSelectedFeatureIds([]);
		syncFeatureState();
	}

	function updateSelectedFeatureLabel(label: string) {
		const nextSelectedIds = [...selectedFeatureIds];
		if (nextSelectedIds.length === 0) {
			return;
		}

		patchFeatureProperties(nextSelectedIds, {
			label
		});
	}

	function updateSelectedFeatureLayer(layerId: string) {
		const nextSelectedIds = [...selectedFeatureIds];
		if (nextSelectedIds.length === 0) {
			return;
		}

		patchFeatureProperties(nextSelectedIds, {
			layerId
		});
	}

	function updateSelectedFeatureGroup(groupId: string | null) {
		const nextSelectedIds = [...selectedFeatureIds];
		if (nextSelectedIds.length === 0) {
			return;
		}

		patchFeatureProperties(nextSelectedIds, {
			groupId
		});
	}

	function updateSelectedFeatureColor(nextColor: string) {
		const nextSelectedIds = [...selectedFeatureIds];
		if (nextSelectedIds.length === 0) {
			return;
		}

		patchFeatureProperties(nextSelectedIds, {
			userColor: normalizeHexColor(nextColor)
		});
	}

	function addFeature(feature: Feature<Point | LineString | Polygon>) {
		const decoratedFeature = decorateFeature(feature);
		if (draw) {
			draw.add(decoratedFeature);
		} else {
			localFeatureCollection = {
				type: 'FeatureCollection',
				features: [...localFeatureCollection.features, decoratedFeature]
			};
		}

		setSelectedFeatureIds([String(decoratedFeature.id ?? '')]);
		applyFeaturePresentationState();
	}

	function addPointFeature(point: [number, number], label: string) {
		const pointFeature: Feature<Point> = {
			type: 'Feature',
			id: createRecordId(),
			properties: {
				label: label || 'Reference point',
				layerId: activeLayerId,
				featureKind: 'point',
				userColor: activeLayer.color
			},
			geometry: {
				type: 'Point',
				coordinates: point
			}
		};

		addFeature(pointFeature);
		flyToPoint(point);

		pointLabel = '';
		inputLat = '';
		inputLng = '';
		inputMgrs = '';
		if (!pointRepeatMode) {
			setActiveTool('select');
		}
	}

	function getRingRadiusMeters() {
		const rawMeters = metersFromUnit(ringDistanceValue, ringDistanceUnit);
		return ringInputMode === 'diameter' ? rawMeters / 2 : rawMeters;
	}

	function addRingAtPoint(point: [number, number]) {
		const radiusMeters = getRingRadiusMeters();
		const label = ringLabel.trim().length > 0 ? ringLabel.trim() : `Ring ${formatDistance(radiusMeters, unitMode, 1)}`;
		const ringFeature = createRingFeature(
			createRecordId(),
			point,
			radiusMeters,
			label,
			{
				layerId: activeLayerId,
				userColor: activeLayer.color,
				groupId: null
			}
		);

		addFeature(ringFeature);
		if (!ringRepeatMode) {
			setActiveTool('select');
		}
	}

	function addRingFromSelectedPoint() {
		if (!selectedPointCoordinates) {
			return;
		}

		addRingAtPoint(selectedPointCoordinates);
	}

	function updateSelectedPointCoordinates(lat: number, lng: number) {
		if (!selectedFeatureId || selectedFeature?.geometry.type !== 'Point') {
			return;
		}

		if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
			return;
		}

		replaceFeature(selectedFeatureId, (feature) => ({
			...feature,
			geometry: {
				type: 'Point',
				coordinates: [lng, lat]
			}
		}));
		flyToPoint([lng, lat]);
	}

	function beginSelectedPointMove() {
		if (!selectedFeatureId || selectedFeature?.geometry.type !== 'Point') {
			return;
		}

		pendingPointMoveFeatureId = selectedFeatureId;
		activeTool = 'select';
	}

	function applyPointMove(point: [number, number]) {
		if (!pendingPointMoveFeatureId) {
			return;
		}

		replaceFeature(pendingPointMoveFeatureId, (feature) => ({
			...feature,
			geometry: {
				type: 'Point',
				coordinates: point
			}
		}));
		pendingPointMoveFeatureId = null;
		flyToPoint(point);
	}

	function updateSelectedRing(distanceValue: number, distanceUnit: 'm' | 'km' | 'mi' | 'nm', mode: 'radius' | 'diameter') {
		if (!selectedFeatureId || !selectedFeature) {
			return;
		}

		const properties = getFeatureProperties(selectedFeature);
		if (properties.featureKind !== 'ring') {
			return;
		}

		const center = getRingCenter(selectedFeature);
		if (!center || !Number.isFinite(distanceValue)) {
			return;
		}

		const rawMeters = metersFromUnit(distanceValue, distanceUnit);
		const radiusMeters = mode === 'diameter' ? rawMeters / 2 : rawMeters;

		replaceFeature(selectedFeatureId, (feature) =>
			createRingFeature(
				String(feature.id ?? selectedFeatureId),
				center,
				radiusMeters,
				typeof feature.properties?.label === 'string' ? feature.properties.label : 'Ring',
				{
					...getFeatureProperties(feature),
					radiusMeters,
					centerLng: center[0],
					centerLat: center[1]
				}
			)
		);
	}

	function setActiveTool(nextTool: ActiveTool) {
		activeTool = nextTool;

		if (draw) {
			if (nextTool === 'route') {
				draw.changeMode('draw_line_string');
				return;
			}

			if (nextTool === 'area') {
				draw.changeMode('draw_polygon');
				return;
			}

			draw.changeMode('simple_select');
		}
	}

	function handleToolbarToolSelect(nextTool: ActiveTool) {
		pendingPointMoveFeatureId = null;
		const resolvedTool = activeTool === nextTool && nextTool !== 'select' ? 'select' : nextTool;
		setActiveTool(resolvedTool);
	}

	function handleMapSurfaceClick(point: [number, number]) {
		if (pendingPointMoveFeatureId) {
			applyPointMove(point);
			return;
		}

		if (activeTool === 'point') {
			addPointFeature(point, buildPointLabel(point, pointLabel));
			return;
		}

		if (activeTool === 'ring') {
			addRingAtPoint(point);
		}
	}

	function plotPointFromInputs() {
		if (!map && !rasterMap) {
			return;
		}

		if (inputMgrs.trim()) {
			try {
				const [lng, lat] = mgrs.toPoint(inputMgrs.trim());
				addPointFeature([lng, lat], pointLabel || inputMgrs.trim());
			} catch {
				return;
			}
			return;
		}

		const lat = Number.parseFloat(inputLat);
		const lng = Number.parseFloat(inputLng);

		if (Number.isNaN(lat) || Number.isNaN(lng)) {
			return;
		}

		addPointFeature([lng, lat], buildPointLabel([lng, lat], pointLabel));
	}

	function createLayer() {
		const name = newLayerName.trim() || `Layer ${layers.length + 1}`;
		const nextLayer = {
			...createScenarioLayer(name, normalizeHexColor(newLayerColor)),
			sortOrder: layers.length
		};
		layers = [...layers, nextLayer];
		activeLayerId = nextLayer.id;
		newLayerName = '';
		newLayerColor = DEFAULT_LAYER_COLOR;
		applyFeaturePresentationState();
	}

	function toggleLayerVisibility(layerId: string) {
		layers = layers.map((layer) =>
			layer.id === layerId ? { ...layer, isVisible: !layer.isVisible } : layer
		);
		applyFeaturePresentationState();
	}

	function toggleLayerLock(layerId: string) {
		layers = layers.map((layer) =>
			layer.id === layerId ? { ...layer, isLocked: !layer.isLocked } : layer
		);
		persistDraft();
	}

	function setActiveLayer(layerId: string) {
		activeLayerId = layerId;
		persistDraft();
	}

	function createGroup() {
		const name = newGroupName.trim() || `Group ${groups.length + 1}`;
		const nextGroup = {
			...createScenarioGroup(name, normalizeHexColor(newGroupColor)),
			description: newGroupDescription.trim()
		};
		groups = [...groups, nextGroup];
		newGroupName = '';
		newGroupColor = DEFAULT_ACCENT_COLOR;
		newGroupDescription = '';
		persistDraft();
		return nextGroup;
	}

	function createGroupFromSelection() {
		if (selectionCount === 0) {
			return;
		}

		const nextGroup = createGroup();
		updateSelectedFeatureGroup(nextGroup.id);
	}

	function assignSelectionToGroup(groupId: string | null) {
		if (selectionCount === 0) {
			return;
		}

		updateSelectedFeatureGroup(groupId);
	}

	function toggleGroupVisibility(groupId: string) {
		groups = groups.map((group) =>
			group.id === groupId ? { ...group, isVisible: !group.isVisible } : group
		);
		applyFeaturePresentationState();
	}

	function toggleGroupLock(groupId: string) {
		groups = groups.map((group) =>
			group.id === groupId ? { ...group, isLocked: !group.isLocked } : group
		);
		persistDraft();
	}

	function saveCurrentView() {
		const name = newSavedViewName.trim() || `View ${savedViews.length + 1}`;
		savedViews = [
			...savedViews,
			{
				id: createRecordId(),
				name,
				view: getCurrentView()
			}
		];
		newSavedViewName = '';
		persistDraft();
	}

	function jumpToSavedView(savedView: SavedView) {
		setCurrentView(savedView.view);
		persistDraft();
	}

	function deleteSavedView(viewId: string) {
		savedViews = savedViews.filter((savedView) => savedView.id !== viewId);
		persistDraft();
	}

	function resetDraft() {
		draw?.deleteAll();
		localFeatureCollection = emptyFeatureCollection();
		map?.flyTo(defaultView);
		rasterMap?.flyTo([defaultView.center[1], defaultView.center[0]], defaultView.zoom, {
			duration: 0.75
		});
		featureSummaries = [];
		setSelectedFeatureIds([]);
		selectedFeature = null;
		scenarioTitle = DEFAULT_SCENARIO_TITLE;
		briefingNotes = DEFAULT_BRIEFING_NOTE;
		gridVisible = true;
		gridSpacingKm = 5;
		layers = [createScenarioLayer('Operational Objects', DEFAULT_LAYER_COLOR)];
		activeLayerId = layers[0].id;
		groups = [];
		savedViews = [];
		unitMode = 'metric';
		activeTool = 'select';
		activeRailSection = 'scenario';
		pendingPointMoveFeatureId = null;
		pointLabel = '';
		inputLat = '';
		inputLng = '';
		inputMgrs = '';
		ringLabel = '';
		ringDistanceValue = 10;
		ringDistanceUnit = 'km';
		ringInputMode = 'radius';
		newLayerName = '';
		newLayerColor = DEFAULT_LAYER_COLOR;
		newGroupName = '';
		newGroupColor = DEFAULT_ACCENT_COLOR;
		newGroupDescription = '';
		newSavedViewName = '';
		renderFallbackFeatures();
		updateGridLayer();
		clearDraftState();
		lastSavedAt = null;
	}

	function getToolTrayTitle(tool: ActiveTool) {
		switch (tool) {
			case 'point':
				return 'Point Tool';
			case 'group':
				return 'Group Tool';
			case 'ring':
				return 'Ring Tool';
			case 'route':
				return 'Route Tool';
			case 'area':
				return 'Area Tool';
			case 'search':
				return 'Search';
			default:
				return '';
		}
	}

	function getToolTrayDescription(tool: ActiveTool) {
		switch (tool) {
			case 'point':
				return 'Click the map once to place a point, or enter exact coordinates below.';
			case 'group':
				return 'Groups organize selected features without changing map geometry.';
			case 'ring':
				return 'Pick a preset, then click a map anchor or use the selected point.';
			case 'route':
				return 'Route drawing uses the map canvas. Double-click to finish the line.';
			case 'area':
				return 'Area drawing uses the map canvas. Click to add vertices and close the polygon.';
			case 'search':
				return 'Jump the map to a country, region, city, or locality.';
			default:
				return '';
		}
	}

	onMount(() => {
		let resizeObserver: ResizeObserver | null = null;
		let destroyed = false;
		let fallbackStarted = false;
		const storedDraft = readDraftState();
		const initialView = storedDraft?.view ?? defaultView;

			const handleKeydown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') {
					pendingPointMoveFeatureId = null;
					setActiveTool('select');
				}
			};

		window.addEventListener('keydown', handleKeydown);
		getBrowserSupabase();

		if (storedDraft) {
			applyDraftState(storedDraft, { restoreView: false });
		} else {
			mapCenterLng = defaultView.center[0];
			mapCenterLat = defaultView.center[1];
			cursorLng = defaultView.center[0];
			cursorLat = defaultView.center[1];
		}

		const initializeRasterFallback = async (reason: string) => {
			if (fallbackStarted || destroyed || !mapHost) {
				return;
			}

			fallbackStarted = true;
			mapSurfaceVisible = false;
			resizeObserver?.disconnect();
			resizeObserver = null;
			map?.remove();
			map = null;
			draw = null;
			mapHost.innerHTML = '';

			const leaflet = await import('leaflet');
			if (destroyed) {
				return;
			}

			leafletModule = leaflet;
			rasterMap?.remove();

			const nextMap = leaflet.map(mapHost, {
				zoomControl: true,
				zoomSnap: 0.5,
				zoomDelta: 1,
				wheelDebounceTime: 24,
				wheelPxPerZoomLevel: 30,
				attributionControl: false,
				preferCanvas: true
			});

			rasterMap = nextMap;
			nextMap.setView([initialView.center[1], initialView.center[0]], initialView.zoom);

			leaflet
				.tileLayer(
					`https://api.mapbox.com/styles/v1/${RASTER_FALLBACK_STYLE_PATH}/tiles/512/{z}/{x}/{y}?access_token=${mapboxConfig.accessToken}`,
					{
						tileSize: 512,
						zoomOffset: -1,
						maxZoom: 18,
						attribution: '© Mapbox © OpenStreetMap'
					}
				)
				.addTo(nextMap);

			leaflet.control
				.scale({
					imperial: false
				})
				.addTo(nextMap);

			leaflet.control
				.attribution({
					prefix: false
				})
				.addAttribution('© Mapbox © OpenStreetMap')
				.addTo(nextMap);

			nextMap.on('moveend', () => {
				const center = nextMap.getCenter();
				mapCenterLng = center.lng;
				mapCenterLat = center.lat;
				cursorLng = center.lng;
				cursorLat = center.lat;
				updateGridLayer();
				persistDraft();
			});

			nextMap.on('mousemove', (event) => {
				cursorLng = event.latlng.lng;
				cursorLat = event.latlng.lat;
			});

			nextMap.on('click', (event) => {
				handleMapSurfaceClick([event.latlng.lng, event.latlng.lat]);
			});

			mapState = 'fallback';
			mapError = reason;

			if (storedDraft) {
				applyDraftState(storedDraft, { restoreView: false });
			}

			resizeObserver = new ResizeObserver(() => {
				nextMap.invalidateSize();
			});
			resizeObserver.observe(mapHost);
			requestAnimationFrame(() => {
				nextMap.invalidateSize();
				revealMapSurface();
			});
		};

		const initializeMap = async () => {
			if (!mapboxEnabled) {
				mapState = 'disabled';
				return;
			}

			if (!mapHost) {
				mapState = 'error';
				mapError = 'Map host element is unavailable.';
				return;
			}

			mapState = 'loading';
			mapError = null;
			mapSurfaceVisible = false;

			try {
				const [{ default: mapbox }, { default: MapboxDrawClass }] =
					await Promise.all([import('mapbox-gl'), import('@mapbox/mapbox-gl-draw')]);

				if (destroyed) {
					return;
				}

				if (!mapbox.supported()) {
					await initializeRasterFallback(
						'WebGL is unavailable in this browser or display session. Raster fallback mode is active.'
					);
					return;
				}

				mapbox.accessToken = mapboxConfig.accessToken;

				const nextMap = new mapbox.Map({
					container: mapHost,
					style: mapboxConfig.styleUrl,
					center: initialView.center,
					zoom: initialView.zoom,
					pitch: initialView.pitch,
					bearing: initialView.bearing,
					attributionControl: false
				});

				map = nextMap;

				nextMap.on('load', () => {
					if (destroyed || map !== nextMap) {
						return;
					}

					nextMap.addControl(
						new mapbox.NavigationControl({ visualizePitch: true }),
						'top-right'
					);
					nextMap.addControl(
						new mapbox.AttributionControl({ compact: true }),
						'bottom-right'
					);

					draw = new MapboxDrawClass({
						displayControlsDefault: false,
						controls: {},
						defaultMode: 'simple_select',
						styles: mapboxDrawStyles
					});

					nextMap.addControl(draw, 'top-left');

					mapState = 'ready';
					buildMapboxGridLayers();
					if (storedDraft) {
						applyDraftState(storedDraft, { restoreView: false });
					}
					requestAnimationFrame(() => {
						nextMap.resize();
						revealMapSurface();
					});
					nextMap.on('draw.create', (event) => {
						const createdFeatures = (
							event as {
								features: Array<Feature<Point | LineString | Polygon>>;
							}
						).features;

						for (const feature of createdFeatures) {
							if (!feature.id) {
								continue;
							}

							const featureKind = inferFeatureKind(feature);
							draw?.setFeatureProperty(String(feature.id), 'layerId', activeLayerId);
							draw?.setFeatureProperty(String(feature.id), 'featureKind', featureKind);
							draw?.setFeatureProperty(
								String(feature.id),
								'renderVisible',
								isFeatureVisibleByIds(activeLayerId, null)
							);
							if (feature.geometry.type !== 'Point') {
								draw?.setFeatureProperty(
									String(feature.id),
									'userColor',
									activeLayer.color
								);
							}
						}

						setSelectedFeatureIds(
							createdFeatures.map((feature) => String(feature.id ?? '')).filter(Boolean)
						);
						if (activeTool === 'route' || activeTool === 'area') {
							setActiveTool('select');
						}
						syncFeatureState();
					});
					nextMap.on('draw.update', () => syncFeatureState());
					nextMap.on('draw.delete', () => {
						setSelectedFeatureIds([]);
						syncFeatureState();
					});
					nextMap.on('draw.selectionchange', (event) => {
						const selected = (
							event as { features: Array<Feature<Point | LineString | Polygon>> }
						).features;
						setSelectedFeatureIds(selected.map((feature) => String(feature.id ?? '')));
						syncFeatureState(false);
					});
				});

				nextMap.on('error', (event) => {
					const errorMessage =
						event.error instanceof Error
							? event.error.message
							: 'Unknown Mapbox rendering error.';
					mapError = errorMessage;

					if (mapState !== 'ready') {
						void initializeRasterFallback(errorMessage);
					}
				});

				nextMap.on('moveend', () => {
					const center = nextMap.getCenter();
					mapCenterLng = center.lng;
					mapCenterLat = center.lat;
					updateGridLayer();
					persistDraft();
				});

				nextMap.on('mousemove', (event) => {
					cursorLng = event.lngLat.lng;
					cursorLat = event.lngLat.lat;
				});

				nextMap.on('click', (event) => {
					handleMapSurfaceClick([event.lngLat.lng, event.lngLat.lat]);
				});

				resizeObserver = new ResizeObserver(() => {
					if (destroyed || map !== nextMap) {
						return;
					}

					try {
						nextMap.resize();
					} catch {
						// Ignore resize callbacks during teardown/fallback transitions.
					}
				});
				resizeObserver.observe(mapHost);
				requestAnimationFrame(() => {
					if (!destroyed && map === nextMap) {
						nextMap.resize();
					}
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error
						? error.message
						: 'Unknown initialization error while creating the map.';
				await initializeRasterFallback(errorMessage);
			}
		};

		void initializeMap();

		return () => {
			destroyed = true;
			window.removeEventListener('keydown', handleKeydown);
			resizeObserver?.disconnect();
			map?.remove();
			rasterMap?.remove();
			map = null;
			draw = null;
			rasterMap = null;
			leafletModule = null;
			rasterGridLayer = null;
			rasterFeatureLayer = null;
		};
	});
</script>

<div class="workspace-shell workspace-shell-progressive">
	<aside class="workspace-rail workspace-rail-progressive">
		<section class="panel panel-brand">
			<div class="eyebrow">WarGames // Progressive Workspace</div>
			<h1>{scenarioTitle}</h1>
			<p>
				A task-first operational map for structured plotting, range analysis, and
				briefing-ready scenario work.
			</p>

			<div class="status-grid">
				<div class="status-card">
					<div class="data-label">Map Stack</div>
					<span class="status-value">{supportState}</span>
					<div class="status-meta">
						{mapError ?? 'Mapbox GL JS primary renderer with Leaflet fallback.'}
					</div>
				</div>

				<div class="status-card">
					<div class="data-label">Save Mode</div>
					<span class="status-value">{dataModeLabel}</span>
					<div class="status-meta">
						{lastSavedAt ? `Last draft save ${lastSavedAt}` : 'Draft not saved yet.'}
					</div>
				</div>
			</div>

			<div class="rail-nav">
				{#each railSections as section}
					<button
						aria-pressed={activeRailSection === section.id}
						class:is-active={activeRailSection === section.id}
						class="toolbar-chip"
						type="button"
						on:click={() => (activeRailSection = section.id)}
					>
						{section.label}
					</button>
				{/each}
			</div>
		</section>

		{#if activeRailSection === 'scenario'}
			<section class="panel">
				<div class="panel-header">Scenario</div>

				<div class="field">
					<div class="field-label">Scenario Title</div>
					<input bind:value={scenarioTitle} on:input={persistDraft} />
				</div>

				<div class="field">
					<div class="field-label">Briefing Note</div>
					<textarea bind:value={briefingNotes} on:input={persistDraft}></textarea>
				</div>

				<div class="toggle-row">
					<div>
						<div class="data-label">Operational Grid</div>
						<div class={gridVisible ? 'flag-positive' : 'flag-warning'}>
							{gridVisible ? 'Grid visible' : 'Grid hidden'}
						</div>
					</div>

					<button class="button" type="button" on:click={toggleGridVisibility}>
						{gridVisible ? 'Hide grid' : 'Show grid'}
					</button>
				</div>

				<div class="chip-group">
					{#each gridOptions as option}
						<button
							class:is-active={gridSpacingKm === option}
							class="chip-button"
							type="button"
							on:click={() => setGridSpacing(option)}
						>
							{option} km
						</button>
					{/each}
				</div>

				<div class="button-row">
					<button class="button ghost" type="button" on:click={resetDraft}>
						Reset draft
					</button>
				</div>
			</section>
		{/if}

		{#if activeRailSection === 'layers'}
			<section class="panel">
				<div class="panel-header">Layers</div>

				<div class="field">
					<div class="field-label">New Layer Name</div>
					<input bind:value={newLayerName} placeholder="Objectives, routes, intelligence" />
				</div>

				<div class="field">
					<div class="field-label">Color</div>
					<input bind:value={newLayerColor} type="color" />
				</div>

				<div class="button-row">
					<button class="button primary" type="button" on:click={createLayer}>
						Create layer
					</button>
				</div>

				<div class="summary-list">
					{#each layers as layer}
						<div class:is-selected={activeLayerId === layer.id} class="summary-card summary-card-static">
							<div class="summary-head">
								<div class="summary-title">{layer.name}</div>
								<div class="summary-kind">{layer.isVisible ? 'Visible' : 'Hidden'}</div>
							</div>
							<div class="summary-detail">Color {layer.color}</div>
							<div class="button-row button-row-tight">
								<button
									class:primary={activeLayerId === layer.id}
									class="button"
									type="button"
									on:click={() => setActiveLayer(layer.id)}
								>
									{activeLayerId === layer.id ? 'Active layer' : 'Set active'}
								</button>
								<button class="button ghost" type="button" on:click={() => toggleLayerVisibility(layer.id)}>
									{layer.isVisible ? 'Hide' : 'Show'}
								</button>
								<button class="button ghost" type="button" on:click={() => toggleLayerLock(layer.id)}>
									{layer.isLocked ? 'Unlock' : 'Lock'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if activeRailSection === 'groups'}
			<section class="panel">
				<div class="panel-header">Groups</div>

				<div class="field">
					<div class="field-label">New Group Name</div>
					<input bind:value={newGroupName} placeholder="Convoy A, Target Package, Sensor Net" />
				</div>

				<div class="field">
					<div class="field-label">Description</div>
					<input bind:value={newGroupDescription} placeholder="Optional group note" />
				</div>

				<div class="field">
					<div class="field-label">Color</div>
					<input bind:value={newGroupColor} type="color" />
				</div>

				<div class="button-row">
					<button class="button primary" type="button" on:click={createGroup}>
						Create group
					</button>
					<button
						class="button"
						disabled={selectionCount === 0}
						type="button"
						on:click={createGroupFromSelection}
					>
						Group selection
					</button>
				</div>

				<p class="hint-text">
					{selectionCount > 0
						? `${selectionCount} feature${selectionCount === 1 ? '' : 's'} selected.`
						: 'Select features on the map to assign them to a group.'}
				</p>

				<div class="summary-list">
					{#each groups as group}
						<div class="summary-card summary-card-static">
							<div class="summary-head">
								<div class="summary-title">{group.name}</div>
								<div class="summary-kind">{group.isVisible ? 'Visible' : 'Hidden'}</div>
							</div>
							<div class="summary-detail">{group.description || 'No description'}</div>
							<div class="button-row button-row-tight">
								<button
									class="button"
									disabled={selectionCount === 0}
									type="button"
									on:click={() => assignSelectionToGroup(group.id)}
								>
									Assign selection
								</button>
								<button class="button ghost" type="button" on:click={() => toggleGroupVisibility(group.id)}>
									{group.isVisible ? 'Hide' : 'Show'}
								</button>
								<button class="button ghost" type="button" on:click={() => toggleGroupLock(group.id)}>
									{group.isLocked ? 'Unlock' : 'Lock'}
								</button>
							</div>
						</div>
					{/each}
					{#if groups.length === 0}
						<div class="empty-state">No groups yet. Create one or group the current selection.</div>
					{/if}
				</div>
			</section>
		{/if}

		{#if activeRailSection === 'views'}
			<section class="panel">
				<div class="panel-header">Saved Views</div>

				<div class="field">
					<div class="field-label">View Name</div>
					<input bind:value={newSavedViewName} placeholder="Theater, route detail, city inset" />
				</div>

				<div class="button-row">
					<button class="button primary" type="button" on:click={saveCurrentView}>
						Save current view
					</button>
				</div>

				<div class="summary-list">
					{#each savedViews as savedView}
						<div class="summary-card summary-card-static">
							<div class="summary-head">
								<div class="summary-title">{savedView.name}</div>
								<div class="summary-kind">View</div>
							</div>
							<div class="summary-detail">
								Zoom {savedView.view.zoom.toFixed(1)} · {savedView.view.center[1].toFixed(2)},
								{savedView.view.center[0].toFixed(2)}
							</div>
							<div class="button-row button-row-tight">
								<button class="button" type="button" on:click={() => jumpToSavedView(savedView)}>
									Open
								</button>
								<button class="button ghost" type="button" on:click={() => deleteSavedView(savedView.id)}>
									Delete
								</button>
							</div>
						</div>
					{/each}
					{#if savedViews.length === 0}
						<div class="empty-state">No saved views yet. Store your current camera as a reusable framing view.</div>
					{/if}
				</div>
			</section>
		{/if}

		{#if activeRailSection === 'objects'}
			<section class="panel">
				<div class="panel-header">Operational Objects</div>

				<div class="metrics-grid">
					<div class="metric-card">
						<div class="data-label">Points</div>
						<span class="metric-value">{pointCount}</span>
						<div class="metric-meta">Markers and plotted references.</div>
					</div>

					<div class="metric-card">
						<div class="data-label">Routes</div>
						<span class="metric-value">{routeCount}</span>
						<div class="metric-meta">{formatDistance(totalDistanceMeters, unitMode, 2)} total line distance.</div>
					</div>

					<div class="metric-card">
						<div class="data-label">Rings</div>
						<span class="metric-value">{ringCount}</span>
						<div class="metric-meta">Saved proximity and range analysis.</div>
					</div>

					<div class="metric-card">
						<div class="data-label">Areas</div>
						<span class="metric-value">{areaCount}</span>
						<div class="metric-meta">{formatArea(totalAreaSqMeters, unitMode, 2)} total footprint.</div>
					</div>
				</div>

				<div class="summary-list">
					{#if featureSummaries.length > 0}
						{#each featureSummaries as summary}
							<button
								class:is-selected={selectedFeatureIds.includes(summary.id)}
								class="summary-card"
								type="button"
								on:click={() => focusFeature(summary.id)}
							>
								<div class="summary-head">
									<div class="summary-title">{summary.label}</div>
									<div class="summary-kind">{summary.kind}</div>
								</div>
								<div class="summary-detail">{summary.metric}</div>
								<div class="summary-detail">{summary.detail}</div>
							</button>
						{/each}
					{:else}
						<div class="empty-state">
							No map objects yet. Use the top action bar to place points, build rings,
							draw routes, or sketch areas.
						</div>
					{/if}
				</div>
			</section>
		{/if}
	</aside>

	<section class="workspace-map">
		<div class:is-targeting-map={activeTool === 'point' || activeTool === 'ring' || pendingPointMove} class="map-frame">
			<div class="map-overlay map-overlay-top">
				<div class="overlay-column overlay-column-wide overlay-column-toolbar">
					<TopActionBar
						{activeTool}
						{unitMode}
						{drawCapable}
						searchEnabled={locationSearchEnabled}
						on:toolselect={(event) => handleToolbarToolSelect(event.detail.tool)}
						on:unitchange={(event) => setUnitMode(event.detail.unitMode)}
					/>

					{#if activeTool !== 'select'}
						<ToolTray
							title={toolTrayTitle}
							description={toolTrayDescription}
							on:close={() => setActiveTool('select')}
						>
							{#if activeTool === 'point'}
								<div class="field">
									<div class="field-label">Label</div>
									<input bind:value={pointLabel} placeholder="Objective, relay, checkpoint" />
								</div>

								<div class="field-group two-col">
									<div class="field">
										<div class="field-label">Latitude</div>
										<input bind:value={inputLat} inputmode="decimal" placeholder="34.0522" />
									</div>

									<div class="field">
										<div class="field-label">Longitude</div>
										<input bind:value={inputLng} inputmode="decimal" placeholder="-118.2437" />
									</div>
								</div>

								<div class="field">
									<div class="field-label">MGRS</div>
									<input
										bind:value={inputMgrs}
										placeholder="4QFJ12345678"
										spellcheck="false"
									/>
								</div>

								<label class="checkbox-row">
									<input bind:checked={pointRepeatMode} type="checkbox" />
									<span>Keep placing points until I exit the tool</span>
								</label>

								<div class="button-row">
									<button class="button primary" type="button" on:click={plotPointFromInputs}>
										Plot from inputs
									</button>
								</div>
							{/if}

							{#if activeTool === 'group'}
								<div class="status-card status-card-inline">
									<div class="data-label">Selection</div>
									<div class="status-value">
										{selectionCount} feature{selectionCount === 1 ? '' : 's'}
									</div>
									<div class="status-meta">
										Create a new group or assign the current selection to an existing one.
									</div>
								</div>

								<div class="field">
									<div class="field-label">New Group Name</div>
									<input bind:value={newGroupName} placeholder="Package Alpha" />
								</div>

								<div class="field">
									<div class="field-label">Color</div>
									<input bind:value={newGroupColor} type="color" />
								</div>

								<div class="button-row">
									<button
										class="button primary"
										disabled={selectionCount === 0}
										type="button"
										on:click={createGroupFromSelection}
									>
										Create and assign
									</button>
								</div>

								{#if groups.length > 0}
									<div class="field">
										<div class="field-label">Assign to Existing</div>
										<select
											disabled={selectionCount === 0}
											on:change={(event) => {
												const groupId = (event.currentTarget as HTMLSelectElement).value;
												assignSelectionToGroup(groupId.length > 0 ? groupId : null);
											}}
										>
											<option value="">No group</option>
											{#each groups as group}
												<option value={group.id}>{group.name}</option>
											{/each}
										</select>
									</div>
								{/if}
							{/if}

							{#if activeTool === 'ring'}
								<div class="chip-group">
									{#each ringPresets as preset}
										<button
											class:is-active={ringDistanceValue === preset.value && ringDistanceUnit === preset.unit}
											class="chip-button"
											type="button"
											on:click={() => {
												ringDistanceValue = preset.value;
												ringDistanceUnit = preset.unit;
											}}
										>
											{preset.label}
										</button>
									{/each}
								</div>

								<div class="field-group two-col">
									<div class="field">
										<div class="field-label">{ringInputMode === 'radius' ? 'Radius' : 'Diameter'}</div>
										<input bind:value={ringDistanceValue} min="0" step="0.1" type="number" />
									</div>

									<div class="field">
										<div class="field-label">Unit</div>
										<select bind:value={ringDistanceUnit}>
											<option value="m">Meters</option>
											<option value="km">Kilometers</option>
											<option value="mi">Miles</option>
											<option value="nm">Nautical miles</option>
										</select>
									</div>
								</div>

								<div class="chip-group">
									<button
										class:is-active={ringInputMode === 'radius'}
										class="chip-button"
										type="button"
										on:click={() => (ringInputMode = 'radius')}
									>
										Radius
									</button>
									<button
										class:is-active={ringInputMode === 'diameter'}
										class="chip-button"
										type="button"
										on:click={() => (ringInputMode = 'diameter')}
									>
										Diameter
									</button>
								</div>

								<div class="field">
									<div class="field-label">Ring Label</div>
									<input bind:value={ringLabel} placeholder="Threat radius, patrol bubble, coverage ring" />
								</div>

								<label class="checkbox-row">
									<input bind:checked={ringRepeatMode} type="checkbox" />
									<span>Keep placing rings until I exit the tool</span>
								</label>

								<div class="button-row">
									<button
										class="button"
										disabled={!selectedPointCoordinates}
										type="button"
										on:click={addRingFromSelectedPoint}
									>
										Use selected point
									</button>
								</div>
							{/if}

							{#if activeTool === 'route'}
								<div class="status-card status-card-inline">
									<div class="data-label">Mode</div>
									<div class="status-value">Straight line</div>
									<div class="status-meta">
										Click the map to add waypoints. Double-click to finish the route.
									</div>
								</div>

								<p class="hint-text">
									Road-aware routing is staged for the next slice, but the saved route
									object and inspector workflow will remain the same.
								</p>
							{/if}

							{#if activeTool === 'area'}
								<div class="status-card status-card-inline">
									<div class="data-label">Area Tool</div>
									<div class="status-value">Draw polygon</div>
									<div class="status-meta">
										Click to place vertices and close the shape on the map.
									</div>
								</div>
							{/if}

							{#if activeTool === 'search'}
								<LocationSearch
									accessToken={mapboxConfig.accessToken}
									disabled={!locationSearchEnabled}
									disabledReason={locationSearchDisabledReason}
									proximity={[mapCenterLng, mapCenterLat]}
									on:select={handleLocationSelect}
								/>
							{/if}
						</ToolTray>
					{/if}
				</div>

				<div class="overlay-column overlay-column-compact">
					<div class="status-strip">
						<div class="strip-card">
							<div class="strip-label">Active Layer</div>
							<div class="strip-value">{activeLayer.name}</div>
							<div class="strip-meta">{activeLayer.isVisible ? 'Visible' : 'Hidden'} · {activeLayer.color}</div>
						</div>

						<div class="strip-card">
							<div class="strip-label">Selection</div>
							<div class="strip-value">
								{selectionCount > 0 ? `${selectionCount} selected` : 'None'}
							</div>
							<div class="strip-meta">
								{#if pendingPointMove}
									Click the map to reposition the selected point.
								{:else}
									{selectedSummary ? selectedSummary.metric : 'Select a feature to inspect it.'}
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			{#if mapboxEnabled}
				<div bind:this={mapHost} class:is-visible={mapSurfaceVisible} class="map-canvas"></div>
				{#if mapState === 'loading' || mapState === 'initializing' || mapState === 'error'}
					<div class="map-loading">
						<div class="placeholder-card">
							<h2>{mapState === 'error' ? 'Map initialization failed' : 'Loading map'}</h2>
							<p>
								{#if mapState === 'error'}
									{mapError ?? 'Mapbox did not finish loading.'}
								{:else}
									Connecting to Mapbox style and tiles.
								{/if}
							</p>
						</div>
					</div>
				{/if}
				{#if mapSurfaceVisible && (mapState === 'ready' || mapState === 'fallback')}
					<div class="map-crosshair"></div>
				{/if}
			{:else}
				<div class="map-placeholder">
					<div class="placeholder-card">
						<h2>Mapbox token required</h2>
						<p>
							Set `PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env` to enable the live map.
							The progressive workspace shell and local draft persistence are already
							in place.
						</p>
						<ul>
							<li>Optional style override: `PUBLIC_MAPBOX_STYLE_URL`</li>
							<li>Supabase keys: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`</li>
							<li>Render target: SvelteKit with the Node adapter</li>
						</ul>
					</div>
				</div>
			{/if}

			<RightInspector
				{selectedFeature}
				selectedSummary={selectedSummary}
				{layers}
				{groups}
				{unitMode}
				selectedColor={selectedFeatureColor}
				canEditColor={canEditSelectedColor}
				on:labelchange={(event) => updateSelectedFeatureLabel(event.detail.label)}
				on:layerchange={(event) => updateSelectedFeatureLayer(event.detail.layerId)}
				on:groupchange={(event) => updateSelectedFeatureGroup(event.detail.groupId)}
				on:colorchange={(event) => updateSelectedFeatureColor(event.detail.color)}
				on:requestmove={() => beginSelectedPointMove()}
				on:coordinateapply={(event) =>
					updateSelectedPointCoordinates(event.detail.lat, event.detail.lng)}
				on:ringapply={(event) =>
					updateSelectedRing(
						event.detail.distanceValue,
						event.detail.distanceUnit,
						event.detail.mode
					)}
				on:delete={deleteSelectedFeatures}
			/>

			<div class="map-overlay map-overlay-bottom">
				<div class="coordinate-ribbon">
					<div class="strip-card">
						<div class="strip-label">Cursor Latitude</div>
						<div class="strip-value">{formatLat(cursorLat)}</div>
						<div class="strip-meta">Cursor Longitude {formatLng(cursorLng)}</div>
					</div>

					<div class="strip-card">
						<div class="strip-label">Cursor Grid</div>
						<div class="strip-value">{cursorMgrs}</div>
						<div class="strip-meta">Military grid reference translation</div>
					</div>
				</div>

				<div class="briefing-ribbon">
					<div class="strip-card">
						<div class="strip-label">Route Summary</div>
						<div class="strip-value">{formatDistance(totalDistanceMeters, unitMode, 2)}</div>
						<div class="strip-meta">Aggregate drawn route distance</div>
					</div>

					<div class="strip-card">
						<div class="strip-label">Area Summary</div>
						<div class="strip-value">{formatArea(totalAreaSqMeters, unitMode, 2)}</div>
						<div class="strip-meta">Aggregate polygon and ring footprint</div>
					</div>
				</div>
			</div>
		</div>
	</section>
</div>
