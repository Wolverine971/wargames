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
	import { mapboxConfig, mapboxEnabled } from '$lib/map/config';
	import { supabaseEnabled } from '$lib/supabase/config';
	import { getBrowserSupabase } from '$lib/supabase/client';

	interface DraftState {
		briefingNotes: string;
		featureCollection: FeatureCollection<Geometry>;
		gridSpacingKm: number;
		gridVisible: boolean;
		scenarioTitle: string;
		view: {
			bearing: number;
			center: [number, number];
			pitch: number;
			zoom: number;
		};
	}

	const GRID_SOURCE_ID = 'ops-grid-source';
	const GRID_MAJOR_LAYER_ID = 'ops-grid-major';
	const GRID_MINOR_LAYER_ID = 'ops-grid-minor';
	const LOCAL_DRAFT_KEY = 'wargames/draft/v1';
	const RASTER_FALLBACK_STYLE_PATH = 'mapbox/satellite-streets-v12';
	const DEFAULT_POLYGON_COLOR = '#77d1ff';
	const POLYGON_COLOR_OPTIONS = [
		'#77d1ff',
		'#19b6ff',
		'#7fd6a8',
		'#f8c26d',
		'#ff7f7f',
		'#d59cff',
		'#f5f7fa',
		'#4a657a'
	];
	const defaultView = {
		center: [-97.5164, 38.8] as [number, number],
		zoom: 4.2,
		bearing: 0,
		pitch: 0
	};
	const gridOptions = [1, 5, 10, 25, 50];

	let mapHost: HTMLDivElement;
	let leafletModule: typeof import('leaflet') | null = null;
	let map: mapboxgl.Map | null = null;
	let draw: MapboxDraw | null = null;
	let rasterMap: LeafletMap | null = null;
	let rasterGridLayer: LeafletGeoJSON | null = null;
	let rasterFeatureLayer: LeafletGeoJSON | null = null;
	let localFeatureCollection: FeatureCollection<Geometry> = {
		type: 'FeatureCollection',
		features: []
	};

	let scenarioTitle = 'WarGames Operational Canvas';
	let briefingNotes =
		'Presentation-first scenario board for drawing objectives, measuring approach distances, and building layered briefs.';
	let gridVisible = true;
	let gridSpacingKm = 5;
	let pointLabel = '';
	let inputLat = '';
	let inputLng = '';
	let inputMgrs = '';
	let featureSummaries: FeatureSummary[] = [];
	let selectedFeatureId: string | null = null;
	let selectedFeature: Feature<Point | LineString | Polygon> | null = null;
	let cursorLng = defaultView.center[0];
	let cursorLat = defaultView.center[1];
	let lastSavedAt: string | null = null;
	let mapState:
		| 'disabled'
		| 'initializing'
		| 'loading'
		| 'ready'
		| 'fallback'
		| 'error' = mapboxEnabled ? 'initializing' : 'disabled';
	let mapError: string | null = null;

	$: pointCount = featureSummaries.filter((item) => item.kind === 'Point').length;
	$: lineCount = featureSummaries.filter((item) => item.kind === 'Line').length;
	$: polygonCount = featureSummaries.filter((item) => item.kind === 'Polygon').length;
	$: totalDistanceKm = featureSummaries.reduce(
		(total, item) => total + item.distanceKm,
		0
	);
	$: totalAreaSqKm = featureSummaries.reduce(
		(total, item) => total + item.areaSqKm,
		0
	);
	$: cursorMgrs = formatMgrs(cursorLng, cursorLat);
	$: dataModeLabel = supabaseEnabled ? 'Supabase-ready workspace' : 'Local draft mode';
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
	$: drawToolsLabel =
		mapState === 'fallback' ? 'Point Plotting + Grid' : 'Point / Line / Polygon';
	$: drawToolsMeta =
		mapState === 'fallback'
			? 'Raster fallback mode is active. Point plotting works; freeform drawing needs WebGL.'
			: 'Top-right controls on the map canvas';
	$: plotterHint =
		mapState === 'fallback'
			? 'Raster fallback mode supports coordinate plotting and grid reference. Freeform line and polygon drawing requires WebGL.'
			: 'Use the draw toolbar on the map for line measurements and polygon geographies. Drawn lines report kilometers; polygons report square kilometers.';
	$: selectedPolygonFeature =
		selectedFeature?.geometry.type === 'Polygon' ? selectedFeature : null;
	$: selectedPolygonColor = selectedPolygonFeature
		? getFeatureColor(selectedPolygonFeature)
		: DEFAULT_POLYGON_COLOR;

	const mapboxDrawStyles = [
		{
			id: 'gl-draw-polygon-fill',
			type: 'fill',
			filter: [['==', '$type', 'Polygon']],
			paint: {
				'fill-color': ['coalesce', ['get', 'userColor'], DEFAULT_POLYGON_COLOR],
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
			filter: [['==', '$type', 'Polygon']],
			layout: {
				'line-cap': 'round',
				'line-join': 'round'
			},
			paint: {
				'line-color': ['coalesce', ['get', 'userColor'], DEFAULT_POLYGON_COLOR],
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
			filter: [['==', '$type', 'LineString']],
			layout: {
				'line-cap': 'round',
				'line-join': 'round'
			},
			paint: {
				'line-color': [
					'case',
					['==', ['get', 'active'], 'true'],
					'#f8c26d',
					'#77d1ff'
				],
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
				['==', 'meta', 'feature']
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
				['==', 'meta', 'feature']
			],
			paint: {
				'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 5, 3],
				'circle-color': [
					'case',
					['==', ['get', 'active'], 'true'],
					'#f8c26d',
					'#77d1ff'
				]
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
				'circle-color': '#f8c26d'
			}
		},
		{
			id: 'gl-draw-midpoint',
			type: 'circle',
			filter: [
				'all',
				['==', 'meta', 'midpoint']
			],
			paint: {
				'circle-radius': 3,
				'circle-color': '#f8c26d'
			}
		}
	];

	function emptyFeatureCollection(): FeatureCollection<Geometry> {
		return {
			type: 'FeatureCollection',
			features: []
		};
	}

	function createFeatureId() {
		return (
			globalThis.crypto?.randomUUID?.() ??
			`feature-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
		);
	}

	function normalizeHexColor(value: string) {
		return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_POLYGON_COLOR;
	}

	function getFeatureColor(feature: Feature<Point | LineString | Polygon>) {
		const value =
			typeof feature.properties?.userColor === 'string'
				? feature.properties.userColor
				: '';

		return normalizeHexColor(value);
	}

	function refreshSelectedFeature(
		collection: FeatureCollection<Point | LineString | Polygon>
	) {
		selectedFeature =
			collection.features.find(
				(feature) => String(feature.id ?? '') === selectedFeatureId
			) ?? null;
	}

	function getCurrentFeatureCollection() {
		if (draw) {
			return draw.getAll() as FeatureCollection<Geometry>;
		}

		return localFeatureCollection;
	}

	function setCurrentView(view: DraftState['view']) {
		if (map) {
			map.jumpTo(view);
		}

		if (rasterMap) {
			rasterMap.setView([view.center[1], view.center[0]], view.zoom);
		}

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

	function setLastSaved() {
		lastSavedAt = new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date());
	}

	function getDraftState(): DraftState | null {
		if (typeof localStorage === 'undefined' || (!map && !rasterMap)) {
			return null;
		}

		const center = map
			? map.getCenter()
			: rasterMap?.getCenter() ?? { lng: defaultView.center[0], lat: defaultView.center[1] };
		const zoom = map ? map.getZoom() : rasterMap?.getZoom() ?? defaultView.zoom;
		const bearing = map ? map.getBearing() : defaultView.bearing;
		const pitch = map ? map.getPitch() : defaultView.pitch;

		return {
			scenarioTitle,
			briefingNotes,
			gridVisible,
			gridSpacingKm,
			featureCollection: getCurrentFeatureCollection(),
			view: {
				center: [center.lng, center.lat],
				zoom,
				bearing,
				pitch
			}
		};
	}

	function persistDraft() {
		const nextDraft = getDraftState();

		if (!nextDraft || typeof localStorage === 'undefined') {
			return;
		}

		localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(nextDraft));
		setLastSaved();
	}

	function restoreDraft() {
		if (typeof localStorage === 'undefined' || (!map && !rasterMap)) {
			return;
		}

		const rawDraft = localStorage.getItem(LOCAL_DRAFT_KEY);
		if (!rawDraft) {
			return;
		}

		let parsedDraft: DraftState;
		try {
			parsedDraft = JSON.parse(rawDraft) as DraftState;
		} catch {
			localStorage.removeItem(LOCAL_DRAFT_KEY);
			return;
		}
		scenarioTitle = parsedDraft.scenarioTitle;
		briefingNotes = parsedDraft.briefingNotes;
		gridVisible = parsedDraft.gridVisible;
		gridSpacingKm = parsedDraft.gridSpacingKm;
		localFeatureCollection = parsedDraft.featureCollection;

		setCurrentView(parsedDraft.view);

		if (draw) {
			draw.deleteAll();
		}

		if (draw && parsedDraft.featureCollection.features.length > 0) {
			draw.add(parsedDraft.featureCollection);
		}

		renderFallbackFeatures();
		syncFeatureState(false);
		updateGridLayer();
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

	function renderFallbackFeatures() {
		if (!leafletModule || !rasterMap) {
			return;
		}

		rasterFeatureLayer?.remove();
		rasterFeatureLayer = leafletModule
			.geoJSON(localFeatureCollection as FeatureCollection<Point | LineString | Polygon>, {
				pointToLayer: (_feature, latlng) =>
					leafletModule!.circleMarker(latlng, {
						radius: 7,
						color: '#77d1ff',
						weight: 2,
						fillColor: '#05121b',
						fillOpacity: 0.92
					}),
				style: (feature) => {
					if (feature?.geometry.type === 'Polygon') {
						const polygonColor = getFeatureColor(
							feature as Feature<Point | LineString | Polygon>
						);
						return {
							color: polygonColor,
							weight: 2,
							fillColor: polygonColor,
							fillOpacity: 0.14
						};
					}

					return {
						color: '#f8c26d',
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
			summarizeFeature(feature, index)
		);

		if (!selectedFeatureId && featureSummaries[0]) {
			selectedFeatureId = featureSummaries[0].id;
		}

		if (
			selectedFeatureId &&
			!featureSummaries.some((feature) => feature.id === selectedFeatureId)
		) {
			selectedFeatureId = featureSummaries[0]?.id ?? null;
		}

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

	function focusFeature(summaryId: string) {
		selectedFeatureId = summaryId;
		const collection = getCurrentFeatureCollection() as FeatureCollection<
			Point | LineString | Polygon
		>;
		refreshSelectedFeature(collection);

		if (draw) {
			draw.changeMode('simple_select', {
				featureIds: [summaryId]
			});
		}

		const feature = collection.features.find((f) => String(f.id) === summaryId);
		if (feature) {
			const geom = feature.geometry;
			const point =
				geom.type === 'Point'
					? (geom.coordinates as [number, number])
					: geom.type === 'LineString'
						? (geom.coordinates[0] as [number, number])
						: geom.type === 'Polygon'
							? (geom.coordinates[0]?.[0] as [number, number])
							: null;
			if (point) {
				flyToPoint(point);
			}
		}
	}

	function updateSelectedPolygonColor(nextColor: string) {
		if (!selectedPolygonFeature || !selectedFeatureId) {
			return;
		}

		const color = normalizeHexColor(nextColor);

		if (draw) {
			draw.setFeatureProperty(selectedFeatureId, 'userColor', color);
		} else {
			localFeatureCollection = {
				type: 'FeatureCollection',
				features: localFeatureCollection.features.map((feature) =>
					String(feature.id ?? '') === selectedFeatureId
						? {
								...feature,
								properties: {
									...(feature.properties ?? {}),
									userColor: color
								}
							}
						: feature
				)
			};
		}

		syncFeatureState();
	}

	function addPointFeature(point: [number, number], label: string) {
		const pointFeature: Feature<Point> = {
			type: 'Feature',
			id: createFeatureId(),
			properties: {
				label: label || 'Reference point'
			},
			geometry: {
				type: 'Point',
				coordinates: point
			}
		};

		if (draw) {
			draw.add(pointFeature);
		} else {
			localFeatureCollection = {
				type: 'FeatureCollection',
				features: [...localFeatureCollection.features, pointFeature]
			};
		}

		flyToPoint(point);

		pointLabel = '';
		inputLat = '';
		inputLng = '';
		inputMgrs = '';
		syncFeatureState();
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
				// Invalid MGRS coordinate string
			}
			return;
		}

		const lat = Number.parseFloat(inputLat);
		const lng = Number.parseFloat(inputLng);

		if (Number.isNaN(lat) || Number.isNaN(lng)) {
			return;
		}

		addPointFeature([lng, lat], pointLabel || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
	}

	function resetDraft() {
		draw?.deleteAll();
		localFeatureCollection = emptyFeatureCollection();
		map?.flyTo(defaultView);
		rasterMap?.flyTo([defaultView.center[1], defaultView.center[0]], defaultView.zoom, {
			duration: 0.75
		});
		featureSummaries = [];
		selectedFeatureId = null;
		selectedFeature = null;
		scenarioTitle = 'WarGames Operational Canvas';
		briefingNotes =
			'Presentation-first scenario board for drawing objectives, measuring approach distances, and building layered briefs.';
		gridVisible = true;
		gridSpacingKm = 5;
		pointLabel = '';
		inputLat = '';
		inputLng = '';
		inputMgrs = '';
		renderFallbackFeatures();
		updateGridLayer();

		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(LOCAL_DRAFT_KEY);
		}

		lastSavedAt = null;
	}

	onMount(() => {
		let resizeObserver: ResizeObserver | null = null;
		let destroyed = false;
		let fallbackStarted = false;

		getBrowserSupabase();

		const initializeRasterFallback = async (reason: string) => {
			if (fallbackStarted || destroyed || !mapHost) {
				return;
			}

			fallbackStarted = true;
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
				zoomSnap: 0.25,
				zoomDelta: 0.25,
				attributionControl: false,
				preferCanvas: true
			});

			rasterMap = nextMap;
			nextMap.setView([defaultView.center[1], defaultView.center[0]], defaultView.zoom);

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
				cursorLng = center.lng;
				cursorLat = center.lat;
				updateGridLayer();
				persistDraft();
			});

			nextMap.on('mousemove', (event) => {
				cursorLng = event.latlng.lng;
				cursorLat = event.latlng.lat;
			});

			mapState = 'fallback';
			mapError = reason;

			restoreDraft();
			updateGridLayer();
			syncFeatureState(false);

			resizeObserver = new ResizeObserver(() => {
				nextMap.invalidateSize();
			});
			resizeObserver.observe(mapHost);
			requestAnimationFrame(() => nextMap.invalidateSize());
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
					center: defaultView.center,
					zoom: defaultView.zoom,
					pitch: defaultView.pitch,
					bearing: defaultView.bearing,
					attributionControl: false
				});

				map = nextMap;

				nextMap.on('load', () => {
					if (destroyed || map !== nextMap) {
						return;
					}

					nextMap.addControl(
						new mapbox.ScaleControl({
							maxWidth: 180,
							unit: 'metric'
						}),
						'bottom-left'
					);
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
						controls: {
							point: true,
							line_string: true,
							polygon: true,
							trash: true
						},
						defaultMode: 'simple_select',
						styles: mapboxDrawStyles
					});

					nextMap.addControl(draw, 'top-right');

					mapState = 'ready';
					buildMapboxGridLayers();
					restoreDraft();
					updateGridLayer();
					syncFeatureState(false);
					requestAnimationFrame(() => nextMap.resize());
					nextMap.on('draw.create', (event) => {
						const createdFeatures = (
							event as {
								features: Array<Feature<Point | LineString | Polygon>>;
							}
						).features;

						for (const feature of createdFeatures) {
							if (feature.geometry.type === 'Polygon' && feature.id) {
								draw?.setFeatureProperty(
									String(feature.id),
									'userColor',
									DEFAULT_POLYGON_COLOR
								);
							}
						}
						syncFeatureState();
					});
					nextMap.on('draw.update', () => syncFeatureState());
					nextMap.on('draw.delete', () => syncFeatureState());
					nextMap.on('draw.selectionchange', () => {
						const selected = draw?.getSelected().features[0];
						selectedFeatureId = selected ? String(selected.id) : selectedFeatureId;
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
					updateGridLayer();
					persistDraft();
				});

				nextMap.on('mousemove', (event) => {
					cursorLng = event.lngLat.lng;
					cursorLat = event.lngLat.lat;
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

<div class="workspace-shell">
	<aside class="workspace-rail">
		<section class="panel panel-brand">
			<div class="eyebrow">WarGames // Presentation Workspace</div>
			<h1>{scenarioTitle}</h1>
			<p>
				A clean tech-spec map room for war game scenario sketches, operational
				ranging, and briefing-grade map captures.
			</p>

			<div class="field">
				<div class="field-label">Scenario Title</div>
				<input bind:value={scenarioTitle} on:input={persistDraft} />
			</div>

			<div class="field">
				<div class="field-label">Briefing Note</div>
				<textarea bind:value={briefingNotes} on:input={persistDraft}></textarea>
			</div>

			<div class="status-grid">
				<div class="status-card">
					<div class="data-label">Map Stack</div>
					<span class="status-value">{supportState}</span>
					<div class="status-meta">
						{mapError ?? 'Mapbox GL JS render engine with kilometer grid overlays.'}
					</div>
				</div>

				<div class="status-card">
					<div class="data-label">Data Layer</div>
					<span class="status-value">{dataModeLabel}</span>
					<div class="status-meta">
						Scenario schema and browser client are wired for Supabase.
					</div>
				</div>
			</div>
		</section>

		<section class="panel">
			<div class="panel-header">Operational Grid</div>

			<div class="toggle-row">
				<div>
					<div class="data-label">Overlay State</div>
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

			<p class="hint-text">
				Grid spacing snaps to the current latitude so the overlay stays usable for
				measurement and briefing screenshots.
			</p>
		</section>

		<section class="panel">
			<div class="panel-header">Coordinate Plotter</div>

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

			<div class="field">
				<div class="field-label">Label</div>
				<input bind:value={pointLabel} placeholder="Objective, route, range marker" />
			</div>

			<div class="button-row">
				<button class="button primary" type="button" on:click={plotPointFromInputs}>
					Plot point
				</button>
				<button class="button ghost" type="button" on:click={resetDraft}>
					Reset draft
				</button>
			</div>

			<p class="hint-text">
				{plotterHint}
			</p>
		</section>

		{#if selectedPolygonFeature}
			<section class="panel">
				<div class="panel-header">Polygon Color</div>

				<div class="selection-style-head">
					<div>
						<div class="data-label">Selected Polygon</div>
						<div class="status-value">
							{typeof selectedPolygonFeature.properties?.label === 'string' &&
							selectedPolygonFeature.properties.label.length > 0
								? selectedPolygonFeature.properties.label
								: 'Operational Area'}
						</div>
					</div>

					<div
						class="selection-color-preview"
						style={`--selection-color:${selectedPolygonColor}`}
					></div>
				</div>

				<div class="color-swatch-grid">
					{#each POLYGON_COLOR_OPTIONS as color}
						<button
							aria-label={`Set polygon color to ${color}`}
							class:is-active={selectedPolygonColor === color}
							class="color-swatch"
							style={`--swatch-color:${color}`}
							type="button"
							on:click={() => updateSelectedPolygonColor(color)}
						></button>
					{/each}
				</div>

				<div class="field">
					<div class="field-label">Custom Color</div>
					<input
						type="color"
						value={selectedPolygonColor}
						on:input={(event) =>
							updateSelectedPolygonColor(
								(event.currentTarget as HTMLInputElement).value
							)}
					/>
				</div>

				<p class="hint-text">
					Polygon fill and outline update immediately and are stored in the local
					scenario draft.
				</p>
			</section>
		{/if}

		<section class="panel">
			<div class="panel-header">Operational Objects</div>

			<div class="metrics-grid">
				<div class="metric-card">
					<div class="data-label">Points</div>
					<span class="metric-value">{pointCount}</span>
					<div class="metric-meta">Reference markers and plotted coordinates.</div>
				</div>

				<div class="metric-card">
					<div class="data-label">Routes</div>
					<span class="metric-value">{lineCount}</span>
					<div class="metric-meta">
						{totalDistanceKm.toFixed(2)} km total line distance.
					</div>
				</div>

				<div class="metric-card">
					<div class="data-label">Areas</div>
					<span class="metric-value">{polygonCount}</span>
					<div class="metric-meta">
						{totalAreaSqKm.toFixed(2)} sq km total area.
					</div>
				</div>

				<div class="metric-card">
					<div class="data-label">Draft Status</div>
					<span class="metric-value">{lastSavedAt ?? 'Unsaved'}</span>
					<div class="metric-meta">Local snapshot retained in browser storage.</div>
				</div>
			</div>

			<div class="summary-list">
				{#if featureSummaries.length > 0}
					{#each featureSummaries as summary}
						<button
							class:is-selected={selectedFeatureId === summary.id}
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
						No map objects yet. Add points from coordinates or use the draw toolbar
						for routes and operational areas.
					</div>
				{/if}
			</div>
		</section>
	</aside>

	<section class="workspace-map">
		<div class="map-frame">
			<div class="map-overlay map-overlay-top">
				<div class="mission-strip">
					<div class="strip-card">
						<div class="strip-label">Scenario</div>
						<div class="strip-value">{scenarioTitle}</div>
						<div class="strip-meta">Tech-spec presentation mode</div>
					</div>

					<div class="strip-card">
						<div class="strip-label">Grid</div>
						<div class="strip-value">{gridSpacingKm} km spacing</div>
						<div class="strip-meta">
							{gridVisible ? 'Operational reference active' : 'Overlay suppressed'}
						</div>
					</div>
				</div>

				<div class="status-strip">
					<div class="strip-card">
						<div class="strip-label">Draw Tools</div>
						<div class="strip-value">{drawToolsLabel}</div>
						<div class="strip-meta">{drawToolsMeta}</div>
					</div>

					<div class="strip-card">
						<div class="strip-label">Persistence</div>
						<div class="strip-value">{supabaseEnabled ? 'Supabase staged' : 'Browser draft'}</div>
						<div class="strip-meta">
							{supabaseEnabled
								? 'Ready for scenario auth and database flows.'
								: 'Set Supabase keys to turn on backend persistence.'}
						</div>
					</div>
				</div>
			</div>

			{#if mapboxEnabled}
				<div bind:this={mapHost} class="map-canvas"></div>
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
				<div class="map-crosshair"></div>
			{:else}
				<div class="map-placeholder">
					<div class="placeholder-card">
						<h2>Mapbox token required</h2>
						<p>
							Set `PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env` to enable the live map.
							The interface, Supabase wiring, and design system are already in
							place.
						</p>
						<ul>
							<li>Optional style override: `PUBLIC_MAPBOX_STYLE_URL`</li>
							<li>Supabase keys: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`</li>
							<li>Render target: SvelteKit with the Node adapter</li>
						</ul>
					</div>
				</div>
			{/if}

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
						<div class="strip-label">Range Summary</div>
						<div class="strip-value">{totalDistanceKm.toFixed(2)} km</div>
						<div class="strip-meta">Aggregate drawn route distance</div>
					</div>

					<div class="strip-card">
						<div class="strip-label">Area Summary</div>
						<div class="strip-value">{totalAreaSqKm.toFixed(2)} sq km</div>
						<div class="strip-meta">Aggregate polygon footprint</div>
					</div>
				</div>
			</div>
		</div>
	</section>
</div>
