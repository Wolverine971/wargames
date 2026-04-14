<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Feature, LineString, Point, Polygon } from 'geojson';
	import type { FeatureSummary } from '$lib/map/metrics';
	import { unitFromMeters, type DistanceUnit } from '$lib/map/units';
	import type { ScenarioGroup, ScenarioLayer, UnitMode } from '$lib/map/workspaceTypes';

	export let selectedFeature: Feature<Point | LineString | Polygon> | null = null;
	export let selectedSummary: FeatureSummary | null = null;
	export let layers: ScenarioLayer[] = [];
	export let groups: ScenarioGroup[] = [];
	export let selectedColor = '#77d1ff';
	export let canEditColor = false;
	export let canEditSelection = true;
	export let lockedReason = '';
	export let unitMode: UnitMode = 'metric';

	const dispatch = createEventDispatcher<{
		labelchange: { label: string };
		layerchange: { layerId: string };
		groupchange: { groupId: string | null };
		colorchange: { color: string };
		requestmove: null;
		coordinateapply: { lat: number; lng: number };
		ringapply: {
			distanceValue: number;
			distanceUnit: DistanceUnit;
			mode: 'radius' | 'diameter';
		};
		delete: null;
	}>();

	let pointLatInput = '';
	let pointLngInput = '';
	let ringDistanceValue = '10';
	let ringDistanceUnit: DistanceUnit = 'km';
	let ringInputMode: 'radius' | 'diameter' = 'radius';
	let lastFeatureSyncKey = '';

	$: label =
		typeof selectedFeature?.properties?.label === 'string' ? selectedFeature.properties.label : '';
	$: selectedLayerId =
		typeof selectedFeature?.properties?.layerId === 'string' ? selectedFeature.properties.layerId : '';
	$: selectedGroupId =
		typeof selectedFeature?.properties?.groupId === 'string' ? selectedFeature.properties.groupId : '';
	$: featureKind =
		typeof selectedFeature?.properties?.featureKind === 'string'
			? selectedFeature.properties.featureKind
			: '';
	$: isPoint = selectedFeature?.geometry.type === 'Point';
	$: isRing = selectedFeature?.geometry.type === 'Polygon' && featureKind === 'ring';

	$: if (selectedFeature) {
		const featureSyncKey = JSON.stringify({
			id: selectedFeature.id ?? '',
			geometry: selectedFeature.geometry,
			radiusMeters:
				typeof selectedFeature.properties?.radiusMeters === 'number'
					? selectedFeature.properties.radiusMeters
					: null
		});
		if (featureSyncKey !== lastFeatureSyncKey) {
			lastFeatureSyncKey = featureSyncKey;

			if (selectedFeature.geometry.type === 'Point') {
				pointLngInput = selectedFeature.geometry.coordinates[0].toFixed(6);
				pointLatInput = selectedFeature.geometry.coordinates[1].toFixed(6);
			}

			if (
				selectedFeature.geometry.type === 'Polygon' &&
				typeof selectedFeature.properties?.radiusMeters === 'number'
			) {
				ringDistanceUnit = unitMode === 'imperial' ? 'mi' : unitMode === 'nautical' ? 'nm' : 'km';
				ringInputMode = 'radius';
				ringDistanceValue = unitFromMeters(
					selectedFeature.properties.radiusMeters,
					ringDistanceUnit
				).toFixed(2);
			}
		}
	} else {
		lastFeatureSyncKey = '';
	}
</script>

{#if selectedSummary && selectedFeature}
	<aside class="map-inspector">
		<section class="panel panel-compact">
			<div class="panel-header">Selection</div>

			{#if !canEditSelection && lockedReason}
				<p class="hint-text flag-warning">{lockedReason}</p>
			{/if}

			<div class="field">
				<div class="field-label">Label</div>
				<input
					disabled={!canEditSelection}
					value={label}
					on:input={(event) =>
						dispatch('labelchange', {
							label: (event.currentTarget as HTMLInputElement).value
						})}
				/>
			</div>

			{#if isPoint}
				<div class="field-group two-col">
					<div class="field">
						<div class="field-label">Latitude</div>
						<input bind:value={pointLatInput} disabled={!canEditSelection} inputmode="decimal" />
					</div>

					<div class="field">
						<div class="field-label">Longitude</div>
						<input bind:value={pointLngInput} disabled={!canEditSelection} inputmode="decimal" />
					</div>
				</div>

				<div class="button-row">
					<button
						class="button"
						disabled={!canEditSelection}
						type="button"
						on:click={() =>
							dispatch('coordinateapply', {
								lat: Number.parseFloat(pointLatInput),
								lng: Number.parseFloat(pointLngInput)
							})}
					>
						Apply coordinates
					</button>
					<button
						class="button ghost"
						disabled={!canEditSelection}
						type="button"
						on:click={() => dispatch('requestmove', null)}
					>
						Reposition on map
					</button>
				</div>
			{/if}

			{#if isRing}
				<div class="field-group two-col">
					<div class="field">
						<div class="field-label">{ringInputMode === 'radius' ? 'Radius' : 'Diameter'}</div>
						<input bind:value={ringDistanceValue} disabled={!canEditSelection} inputmode="decimal" />
					</div>

					<div class="field">
						<div class="field-label">Unit</div>
						<select bind:value={ringDistanceUnit} disabled={!canEditSelection}>
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
						disabled={!canEditSelection}
						type="button"
						on:click={() => (ringInputMode = 'radius')}
					>
						Radius
					</button>
					<button
						class:is-active={ringInputMode === 'diameter'}
						class="chip-button"
						disabled={!canEditSelection}
						type="button"
						on:click={() => (ringInputMode = 'diameter')}
					>
						Diameter
					</button>
				</div>

				<div class="button-row">
					<button
						class="button"
						disabled={!canEditSelection}
						type="button"
						on:click={() =>
							dispatch('ringapply', {
								distanceValue: Number.parseFloat(ringDistanceValue),
								distanceUnit: ringDistanceUnit,
								mode: ringInputMode
							})}
					>
						Update ring
					</button>
				</div>
			{/if}

			<div class="inspector-grid">
				<div class="status-card">
					<div class="data-label">Type</div>
					<div class="status-value">{selectedSummary.kind}</div>
					<div class="status-meta">{selectedSummary.metric}</div>
				</div>

				<div class="status-card">
					<div class="data-label">Detail</div>
					<div class="status-value">{selectedSummary.detail}</div>
					<div class="status-meta">Selection details update immediately.</div>
				</div>
			</div>

			<div class="field">
				<div class="field-label">Layer</div>
				<select
					disabled={!canEditSelection}
					value={selectedLayerId}
					on:change={(event) =>
						dispatch('layerchange', {
							layerId: (event.currentTarget as HTMLSelectElement).value
						})}
				>
					{#each layers as layer}
						<option value={layer.id}>{layer.name}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<div class="field-label">Group</div>
				<select
					disabled={!canEditSelection}
					value={selectedGroupId}
					on:change={(event) => {
						const nextValue = (event.currentTarget as HTMLSelectElement).value;
						dispatch('groupchange', {
							groupId: nextValue.length > 0 ? nextValue : null
						});
					}}
				>
					<option value="">No group</option>
					{#each groups as group}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>
			</div>

			{#if canEditColor}
				<div class="field">
					<div class="field-label">Color</div>
					<input
						disabled={!canEditSelection}
						type="color"
						value={selectedColor}
						on:input={(event) =>
							dispatch('colorchange', {
								color: (event.currentTarget as HTMLInputElement).value
							})}
					/>
				</div>
			{/if}

			<div class="button-row">
				<button
					class="button danger"
					disabled={!canEditSelection}
					type="button"
					on:click={() => dispatch('delete', null)}
				>
					Delete selected
				</button>
			</div>
		</section>
	</aside>
{/if}
