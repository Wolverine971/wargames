# Map Suite Implementation Plan

Date: April 4, 2026

Companion to:

- [/Users/djwayne/wargames/docs/map-feature-suite.md](/Users/djwayne/wargames/docs/map-feature-suite.md)
- [/Users/djwayne/wargames/docs/map-ui-research.md](/Users/djwayne/wargames/docs/map-ui-research.md)

## Goal

Implement the full mapping feature suite as a coherent product, not as a pile of disconnected tools.

The plan must preserve three things:

- high-speed authoring
- low screen clutter
- room for AI-assisted workflows later in the same UI model

## Current Constraints

The current codebase already proves the map surface, but it is still organized like a prototype:

- most workspace logic lives inside [`OperationsMap.svelte`](/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte)
- state is mostly local to the component
- browser draft persistence exists, but scenario persistence is not yet implemented
- the database supports scenarios, layers, and features, but not groups or saved views yet

This means the first implementation work is architectural, not cosmetic.

## Delivery Principles

1. One primary map action at a time.
2. Tool options appear progressively, only after the tool is chosen.
3. Selection details live in an inspector, not in the toolbar.
4. Every analysis result should be saveable as a normal object.
5. AI commands should map onto the same tool system as manual interactions.

## Target Product Structure

The map workspace should be split into these product surfaces:

- `TopActionBar`
- `ToolTray`
- `LeftRail`
- `RightInspector`
- `BottomRibbon`
- `MapCanvas`
- `AiCopilot`

### TopActionBar

Always visible, compact, and task-first.

Primary actions:

- `Select`
- `Point`
- `Group`
- `Ring`
- `Route`
- `Area`
- `Measure`
- `Annotate`
- `Search`

### ToolTray

Contextual panel that opens only for the active tool.

Examples:

- `Ring` tray shows presets, unit mode, radius or diameter choice
- `Route` tray shows straight versus road mode and waypoint controls
- `Group` tray shows selected count, create group, assign group

Only one tray should be open at a time.

### LeftRail

Persistent but collapsible navigation for structured browsing:

- layers
- groups
- analysis
- saved views

### RightInspector

Selection-driven detail pane:

- metadata
- styling
- measurements
- layer assignment
- group assignment
- quick actions

### BottomRibbon

Small operational readouts:

- cursor coordinates
- units
- selected feature metrics
- route distance and duration

### AiCopilot

An optional assistant surface that can:

- create or edit map objects from natural language
- explain selected objects
- suggest next actions
- translate commands into previewable map actions

It should not bypass the tool model. It should drive the same actions the UI exposes.

## Technical Architecture

## 1. Component Split

Refactor the current monolith into:

- `MapWorkspace.svelte`
- `MapCanvas.svelte`
- `TopActionBar.svelte`
- `ToolTray.svelte`
- `LeftRail.svelte`
- `RightInspector.svelte`
- `BottomRibbon.svelte`
- `AiCopilot.svelte`

Tool-specific panels:

- `PointToolPanel.svelte`
- `GroupToolPanel.svelte`
- `RingToolPanel.svelte`
- `RouteToolPanel.svelte`
- `MeasureToolPanel.svelte`
- `AnnotateToolPanel.svelte`

## 2. State Stores

Move UI and workspace state into focused stores:

- `scenarioStore`
- `featureStore`
- `layerStore`
- `groupStore`
- `savedViewStore`
- `selectionStore`
- `toolStore`
- `unitStore`
- `saveStatusStore`
- `aiStore`

Key rule:

- map engine state should not own product state

The map engine should render from stores and publish interactions back into them.

## 3. Service Layer

Create explicit service modules:

- `scenarioRepository.ts`
- `layerRepository.ts`
- `groupRepository.ts`
- `featureRepository.ts`
- `savedViewRepository.ts`
- `routingService.ts`
- `geospatialAnalysisService.ts`
- `importExportService.ts`
- `aiActionService.ts`

## 4. Map Engine Adapter

Keep `Mapbox GL JS` primary and `Leaflet` fallback.

Introduce an adapter boundary so product features are expressed in shared terms:

- add feature
- update feature
- remove feature
- fit bounds
- begin tool interaction
- render transient preview

This reduces future coupling between the UI model and renderer details.

## Data Model Plan

## Existing Tables

Already present:

- `scenarios`
- `scenario_layers`
- `scenario_features`

## New Tables

Add:

- `scenario_groups`
- `saved_views`

## Feature Table Changes

Extend `scenario_features` with support for:

- `kind='ring'`
- `kind='route'` later
- `group_id`
- canonical measurement fields or measurement metadata
- style metadata
- analysis metadata

Recommended canonical fields:

- `distance_meters`
- `area_sq_meters`
- `duration_seconds`

If you want to avoid table sprawl early, these can live inside `properties` first, but the shape must still be normalized.

## Scenario Preferences

Store per-scenario defaults for:

- unit mode
- active layer
- preferred ring presets
- presentation mode

These can live in `presentation_settings` or a dedicated settings object initially.

## Delivery Phases

## Phase 0: Refactor Foundation

Goal:

Create enough structure to ship new features without turning `OperationsMap.svelte` into a bottleneck.

Work:

- extract workspace shell components
- move draft state into stores
- isolate map rendering logic
- create repository interfaces even if local mode still backs them initially
- keep current behavior working during the split

Acceptance criteria:

- map still loads in Mapbox and fallback mode
- existing point, line, and polygon behavior still works
- save/load code path has a clear repository boundary

## Phase 1: Persistence and Organizational Model

Goal:

Turn the app into a reusable workspace with layers, groups, and saved views.

Work:

- implement scenario persistence
- implement layer CRUD and active-layer assignment
- add `scenario_groups`
- add `saved_views`
- wire left rail for layers, groups, and views
- add save status and autosave

Acceptance criteria:

- scenario data reloads from Supabase
- layers can be created, reordered, hidden, and locked
- groups can be created and assigned
- saved views can be created and reopened

## Phase 2: Progressive Tool System

Goal:

Replace the split current controls with a consistent task-first tool model.

Work:

- build `TopActionBar`
- build `ToolTray`
- define tool lifecycle: idle, armed, previewing, committed
- remove dependence on Mapbox Draw UI as the primary interaction entry point
- keep Mapbox Draw behind the scenes only where useful

Acceptance criteria:

- one active tool at a time
- tool options open progressively
- the map stays readable while a tool is active
- keyboard escape cleanly exits the active tool

## Phase 3: Point, Group, and Inspector Workflows

Goal:

Make the base authoring workflow intuitive before adding more analysis.

Work:

- click-to-place point in the new tool system
- inline labeling
- drag-to-reposition
- multi-select and box select
- right inspector for style, layer, group, and measurement metadata

Acceptance criteria:

- user can place and edit points quickly
- user can select multiple points and create a group
- selected objects expose their details in one consistent place

## Phase 4: Ring and Measurement System

Goal:

Ship the first signature analysis workflow.

Work:

- ring tool
- radius versus diameter mode
- unit system for metric, imperial, and nautical
- ring presets and custom values
- multiple rings from one anchor point
- points-inside-ring query
- improved measurement readouts

Acceptance criteria:

- user can click a point and create a `5 mi` or `10 km` ring in one short flow
- user can switch units without altering stored geometry
- ring objects persist and are editable

## Phase 5: Route System

Goal:

Support both geometric planning routes and road-aware route analysis.

Work:

- straight-line route mode
- waypoint editing and reordering
- route summaries
- Mapbox Directions integration
- road mode toggle
- route duration display
- optional Optimization API integration later

Acceptance criteria:

- route through multiple clicked waypoints works locally
- road mode returns a route geometry and duration
- route can switch between straight and road-aware representation

## Phase 6: Annotation and Presentation

Goal:

Make authored maps presentable without additional cleanup.

Work:

- annotation tool
- callouts and labels
- presentation mode
- map snapshot export
- saved presentation views

Acceptance criteria:

- user can hide editing chrome
- user can capture briefing-ready layouts
- annotations persist with the scenario

## Phase 7: AI Copilot

Goal:

Add AI in a way that improves workflow instead of creating ambiguity.

Work:

- add a compact AI command bar
- parse commands into structured actions
- preview AI changes on the map before applying
- support commands such as:
  - `drop a point at 34.05, -118.24 called Alpha`
  - `draw a 10 mile ring around Alpha`
  - `group selected points as Convoy A`
  - `route through these points by road`

Acceptance criteria:

- AI commands resolve into normal tool actions
- user can preview and accept or reject the result
- AI never silently mutates saved geometry

## Progressive-Disclosure Rules

The implementation should follow these UI rules:

1. No more than one expanded tool tray at a time.
2. Advanced options stay collapsed until needed.
3. Persistent controls should be status-oriented, not form-heavy.
4. Selection-specific controls belong in the inspector, not the tray.
5. Bulk actions appear only after multi-select exists.

## Testing Plan

## Unit Tests

- unit conversion logic
- ring generation logic
- feature serialization
- group assignment logic
- route normalization

## Integration Tests

- create scenario, save, reload
- create point, create ring, reload
- create group from selection
- switch route between straight and road mode

## UI Tests

- tool tray opens and closes correctly
- progressive option disclosure works
- escape and cancel behaviors are reliable
- inspector updates on selection changes

## Performance Plan

Focus areas:

- break up oversized client bundles
- lazy-load route and AI functionality
- minimize rerenders from large feature collections
- treat transient previews separately from committed features

## Recommended First Milestone

If you want the first implementation slice to feel noticeably better fast, ship this sequence:

1. refactor the workspace shell
2. implement scenario persistence
3. implement layers and groups
4. build the top action bar and tool tray
5. add the right inspector
6. add the ring tool and unit toggle

That is the first milestone where the product stops feeling like a drawing demo and starts feeling like an operational workspace.
