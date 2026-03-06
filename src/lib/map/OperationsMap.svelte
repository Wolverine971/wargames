<svelte:head>
	<title>WarGames Command Map</title>
	<meta
		name="description"
		content="Operational mapping workspace for war game presentations, measurements, and scenario sketching."
	/>
</svelte:head>

<script lang="ts">
	import mapboxgl from 'mapbox-gl';
	import MapboxDraw from '@mapbox/mapbox-gl-draw';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
	import { onMount } from 'svelte';
	import * as mgrs from 'mgrs';
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
	const defaultView = {
		center: [-97.5164, 38.8] as [number, number],
		zoom: 4.2,
		bearing: 0,
		pitch: 0
	};
	const gridOptions = [1, 5, 10, 25, 50];

	let mapHost: HTMLDivElement;
	let map: mapboxgl.Map | null = null;
	let draw: MapboxDraw | null = null;

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
	let cursorLng = defaultView.center[0];
	let cursorLat = defaultView.center[1];
	let lastSavedAt: string | null = null;

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
	$: supportState = mapboxEnabled
		? 'Mapbox rendering online'
		: 'Awaiting Mapbox access token';

	function setLastSaved() {
		lastSavedAt = new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date());
	}

	function getDraftState(): DraftState | null {
		if (typeof localStorage === 'undefined' || !draw || !map) {
			return null;
		}

		return {
			scenarioTitle,
			briefingNotes,
			gridVisible,
			gridSpacingKm,
			featureCollection: draw.getAll(),
			view: {
				center: [map.getCenter().lng, map.getCenter().lat],
				zoom: map.getZoom(),
				bearing: map.getBearing(),
				pitch: map.getPitch()
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
		if (typeof localStorage === 'undefined' || !map || !draw) {
			return;
		}

		const rawDraft = localStorage.getItem(LOCAL_DRAFT_KEY);
		if (!rawDraft) {
			return;
		}

		const parsedDraft = JSON.parse(rawDraft) as DraftState;
		scenarioTitle = parsedDraft.scenarioTitle;
		briefingNotes = parsedDraft.briefingNotes;
		gridVisible = parsedDraft.gridVisible;
		gridSpacingKm = parsedDraft.gridSpacingKm;

		map.jumpTo(parsedDraft.view);
		draw.deleteAll();

		if (parsedDraft.featureCollection.features.length > 0) {
			draw.add(parsedDraft.featureCollection);
		}

		syncFeatureState(false);
		updateGridLayer();
		setLastSaved();
	}

	function buildGridLayers() {
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

	function updateGridLayer() {
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

	function syncFeatureState(persist = true) {
		if (!draw) {
			return;
		}

		const collection = draw.getAll() as FeatureCollection<
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
	}

	function addPointFeature(point: [number, number], label: string) {
		if (!draw) {
			return;
		}

		draw.add({
			type: 'Feature',
			properties: {
				label: label || 'Reference point'
			},
			geometry: {
				type: 'Point',
				coordinates: point
			}
		});

		map?.flyTo({
			center: point,
			zoom: Math.max(map.getZoom(), 9)
		});

		pointLabel = '';
		inputLat = '';
		inputLng = '';
		inputMgrs = '';
		syncFeatureState();
	}

	function plotPointFromInputs() {
		if (!draw || !map) {
			return;
		}

		if (inputMgrs.trim()) {
			const [lng, lat] = mgrs.toPoint(inputMgrs.trim());
			addPointFeature([lng, lat], pointLabel || inputMgrs.trim());
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
		map?.flyTo(defaultView);
		featureSummaries = [];
		selectedFeatureId = null;
		scenarioTitle = 'WarGames Operational Canvas';
		briefingNotes =
			'Presentation-first scenario board for drawing objectives, measuring approach distances, and building layered briefs.';
		gridVisible = true;
		gridSpacingKm = 5;
		pointLabel = '';
		inputLat = '';
		inputLng = '';
		inputMgrs = '';
		updateGridLayer();

		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(LOCAL_DRAFT_KEY);
		}

		setLastSaved();
	}

	onMount(() => {
		getBrowserSupabase();

		if (!mapboxEnabled) {
			return;
		}

		mapboxgl.accessToken = mapboxConfig.accessToken;
		map = new mapboxgl.Map({
			container: mapHost,
			style: mapboxConfig.styleUrl,
			center: defaultView.center,
			zoom: defaultView.zoom,
			pitch: defaultView.pitch,
			bearing: defaultView.bearing,
			attributionControl: false
		});

		map.addControl(
			new mapboxgl.ScaleControl({
				maxWidth: 180,
				unit: 'metric'
			}),
			'bottom-left'
		);
		map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
		map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

		draw = new MapboxDraw({
			displayControlsDefault: false,
			controls: {
				point: true,
				line_string: true,
				polygon: true,
				trash: true
			},
			defaultMode: 'simple_select'
		});

		map.addControl(draw, 'top-right');

		map.on('load', () => {
			buildGridLayers();
			restoreDraft();
			updateGridLayer();
			syncFeatureState(false);
		});

		map.on('moveend', () => {
			updateGridLayer();
			persistDraft();
		});

		map.on('mousemove', (event) => {
			cursorLng = event.lngLat.lng;
			cursorLat = event.lngLat.lat;
		});

		map.on('draw.create', () => syncFeatureState());
		map.on('draw.update', () => syncFeatureState());
		map.on('draw.delete', () => syncFeatureState());
		map.on('draw.selectionchange', () => {
			const selected = draw?.getSelected().features[0];
			selectedFeatureId = selected ? String(selected.id) : selectedFeatureId;
			syncFeatureState(false);
		});

		return () => {
			map?.remove();
			map = null;
			draw = null;
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
						Mapbox GL JS render engine with kilometer grid overlays.
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
				Use the draw toolbar on the map for line measurements and polygon
				geographies. Drawn lines report kilometers; polygons report square
				kilometers.
			</p>
		</section>

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
						<div class="strip-value">Point / Line / Polygon</div>
						<div class="strip-meta">Top-right controls on the map canvas</div>
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
