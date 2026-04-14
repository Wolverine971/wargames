<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ActiveTool, UnitMode } from '$lib/map/workspaceTypes';
	import { UNIT_MODE_LABELS } from '$lib/map/units';

	export let activeTool: ActiveTool = 'select';
	export let unitMode: UnitMode = 'metric';
	export let drawCapable = true;
	export let searchEnabled = true;

	const dispatch = createEventDispatcher<{
		toolselect: { tool: ActiveTool };
		unitchange: { unitMode: UnitMode };
	}>();

	const tools: Array<{
		id: ActiveTool;
		label: string;
		requiresDraw?: boolean;
		requiresSearch?: boolean;
	}> = [
		{ id: 'select', label: 'Select' },
		{ id: 'point', label: 'Point' },
		{ id: 'group', label: 'Group' },
		{ id: 'ring', label: 'Ring' },
		{ id: 'route', label: 'Route', requiresDraw: true },
		{ id: 'area', label: 'Area', requiresDraw: true },
		{ id: 'search', label: 'Search', requiresSearch: true }
	];
</script>

<div class="workspace-toolbar">
	<div class="toolbar-group">
		{#each tools as tool}
			<button
				aria-pressed={activeTool === tool.id}
				class:is-active={activeTool === tool.id}
				class="toolbar-button"
				disabled={(tool.requiresDraw && !drawCapable) || (tool.requiresSearch && !searchEnabled)}
				type="button"
				on:click={() => dispatch('toolselect', { tool: tool.id })}
			>
				{tool.label}
			</button>
		{/each}
	</div>

	<div class="toolbar-group toolbar-group-units">
		{#each (Object.keys(UNIT_MODE_LABELS) as UnitMode[]) as nextUnitMode}
			<button
				aria-pressed={unitMode === nextUnitMode}
				class:is-active={unitMode === nextUnitMode}
				class="toolbar-chip"
				type="button"
				on:click={() => dispatch('unitchange', { unitMode: nextUnitMode })}
			>
				{UNIT_MODE_LABELS[nextUnitMode]}
			</button>
		{/each}
	</div>
</div>
