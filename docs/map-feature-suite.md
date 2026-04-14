# Map Feature Suite

Date: April 4, 2026

Companion to:

- [Map UI Research](/Users/djwayne/wargames/docs/map-ui-research.md)
- [WarGames Platform Design](/Users/djwayne/wargames/docs/wargames-platform-design.md)
- [WarGames Next Iteration Assessment](/Users/djwayne/wargames/docs/next-iteration-assessment.md)

## Purpose

Define the complete UI mapping feature set for the product so implementation can move from a useful prototype into a durable operational workspace.

This document is intentionally broader than "draw points on a map." It covers:

- authoring
- grouping and organization
- measurement and analysis
- routing
- search and navigation
- presentation
- persistence
- interoperability

## Product Principles

The feature suite should follow five rules:

1. Common actions must be one or two clicks, not hidden behind geometry jargon.
2. Analysis artifacts must behave like first-class map objects, not temporary overlays.
3. Organization must separate visual structure from semantic grouping.
4. Measurements must be canonical internally and flexible in display.
5. The UI should feel task-first, closer to Gaia than to a generic draw-toolbar demo.

## Core Mental Model

The app should treat the map as a workspace made of:

- `Scenarios`
- `Layers`
- `Groups`
- `Features`
- `Analysis artifacts`
- `Saved views`

### Scenarios

A scenario is the top-level workspace.

It owns:

- title
- briefing notes
- map defaults
- layers
- saved analysis
- presentation settings

### Layers

Layers are for display and editing control.

Layers answer questions like:

- should this be visible
- should this be locked
- what color family should this use
- what order should it render in

### Groups

Groups are for semantic organization.

Groups answer questions like:

- which points belong to the same convoy
- which sites belong to the same network
- which targets belong to package A
- which objects should be selected and analyzed together

Important rule:

- `Layer` is not the same thing as `Group`

One layer can contain many groups. One group can span multiple feature kinds.

### Features

Features are concrete map objects:

- points
- routes
- polygons
- rings
- bearings
- annotations

### Analysis Artifacts

Analysis artifacts are computed or semi-computed objects:

- range rings
- isochrones
- nearest-neighbor links
- route time and distance summaries
- buffers
- corridor polygons

They must be savable and selectable like any other feature.

### Saved Views

Saved views are reusable map camera presets:

- theater-wide
- city-level
- route detail
- presentation crop

## Complete Feature Suite

### 1. Point Authoring

Must support:

- click-to-place point
- plot from latitude/longitude
- plot from MGRS
- plot from search result
- drag existing point to reposition
- rename point inline
- assign icon, color, and status

Should support:

- batch point import from CSV or GeoJSON
- duplicate point
- snap point to nearest road or feature when enabled

### 2. Point Grouping

Must support:

- assign one or more selected points to a named group
- create group from current selection
- color-code group members
- filter map by group
- show group summary counts and aggregate metrics

Should support:

- group hull or bounding shape
- collapse group into a single cluster card in side panels
- duplicate or export a group

### 3. Radius and Ring Analysis

This is a first-class capability, not a side feature.

Must support:

- create ring from any point
- presets such as `1 mi`, `5 mi`, `10 mi`, `25 km`, `50 km`
- custom numeric radius
- unit switch for `m`, `km`, `mi`, and `nm`
- explicit `radius` versus `diameter` input mode
- multiple rings around the same point
- label each ring

Should support:

- filled buffer mode
- donut mode between two distances
- percentage-opacity or dashed styling
- show points inside a ring
- save ring presets per user or scenario

### 4. Distance and Area Measurement

Must support:

- line distance measurement
- polygon area measurement
- per-feature measurement display
- unit conversion in the inspector
- cumulative distance summary for selected routes

Should support:

- bearing and azimuth
- segment-by-segment breakdown
- corridor width around a route
- elevation-aware distance later if terrain enters scope

### 5. Routing

Must support:

- straight-line route between clicked waypoints
- waypoint editing and reordering
- route distance summary
- route label and styling

Should support:

- road-aware route mode
- estimated travel duration
- optimized waypoint order for multi-stop route planning
- route alternatives
- route snapping and validation

### 6. Search and Navigation

Must support:

- place search
- jump to country, region, city, or locality
- coordinate search
- zoom to selected feature or group
- save current camera as named view

Should support:

- recent searches
- bookmarked places
- search by group, label, or layer
- fit map to active analysis result

### 7. Selection and Editing

Must support:

- single select
- multi-select
- box select
- edit label
- recolor feature
- move, duplicate, delete
- keyboard shortcuts for common actions

Should support:

- bulk reassignment to layer
- bulk reassignment to group
- lock selected features
- snap editing handles
- undo and redo

### 8. Layer Management

Must support:

- create layer
- rename layer
- reorder layers
- toggle visibility
- lock editing
- set default color
- set active layer for new features

Should support:

- layer templates
- layer opacity
- layer blend or semantic type
- per-layer export

### 9. Annotation and Briefing

Must support:

- text labels
- leader lines
- icon markers
- title callouts
- presentation-friendly styling

Should support:

- classification banners
- framing boxes
- legend blocks
- annotation anchoring to features

### 10. Analysis Workflows

Must support:

- select a point and create a ring
- select multiple points and group them
- select a route and see total distance
- select an area and see footprint

Should support:

- find all points inside selected ring
- find nearest point or group
- compare straight-line versus road distance
- create travel-time zones from a point
- create corridor around a route

### 11. Presentation Mode

Must support:

- hide editing chrome
- keep map overlays legible
- preserve saved views
- support screenshot-ready layout

Should support:

- slide-safe aspect ratio presets
- dark and light presentation themes
- focused briefing ribbon
- export map snapshot

### 12. Persistence and History

Must support:

- save scenario
- autosave with status
- reload saved features, layers, groups, and views
- recover analysis artifacts

Should support:

- version history
- duplicate scenario
- compare revisions
- restore deleted object

### 13. Import and Export

Must support:

- GeoJSON import and export
- CSV point import
- map snapshot export

Should support:

- KML import and export
- shapefile import later through a conversion step
- PDF briefing export

### 14. Collaboration

Must support later:

- multi-user scenario access
- ownership and sharing model

Should support later:

- presence indicators
- comment threads on features
- assignment or tasking

## Capability Tiers

### Tier 1: Foundation

These should define the first real mapping release:

- point authoring
- groups
- rings and buffers
- distance and area measurement
- layers
- selection inspector
- scenario persistence
- saved views

### Tier 2: Operational Analysis

- road-aware routes
- route duration and comparison
- points-in-ring queries
- corridor and buffer tools
- presentation mode
- import and export

### Tier 3: Advanced Planning

- isochrones
- optimization for waypoint order
- revision history
- collaboration
- terrain-aware analysis

## Recommended UI Structure

### Top Action Bar

Primary actions:

- `Add Point`
- `Group`
- `Ring`
- `Route`
- `Area`
- `Measure`
- `Annotate`
- `Search`

These should be visible at all times.

### Left Rail

Persistent navigation:

- `Layers`
- `Groups`
- `Find`
- `Analysis`
- `Views`

### Right Inspector

Selection-driven inspector:

- name
- type
- layer
- group
- measurements
- units
- style
- quick actions

### Bottom Ribbon

Operational readouts:

- cursor coordinates
- current unit mode
- current selection metrics
- route distance and duration

## Grouping Model

Grouping needs to be explicit because it is central to your workflow.

Recommended grouping rules:

1. A feature belongs to one layer.
2. A feature may belong to zero or one primary group in V1.
3. Multi-group membership can wait until later if needed.
4. Groups can contain points, routes, polygons, and rings.
5. Group membership must be editable in bulk.

Recommended initial group attributes:

- `id`
- `scenarioId`
- `name`
- `color`
- `icon`
- `description`
- `sortOrder`
- `isVisible`
- `isLocked`

## Measurement Model

Store canonical values in metric units:

- `distanceMeters`
- `areaSqMeters`
- `radiusMeters`
- `durationSeconds`

Display conversions as needed:

- metric
- imperial
- nautical

This prevents unit bugs and keeps routing, ring, and area logic consistent.

## Feature Types To Support

Recommended V1 feature kinds:

- `point`
- `line`
- `polygon`
- `ring`
- `annotation`

Recommended V2 additions:

- `route`
- `corridor`
- `isochrone`
- `bearing`

Note:

- `route` should become distinct from a generic `line` once road-aware behavior and duration data are introduced.

## Data Model Impact

The current schema already supports scenarios, layers, and features in:

- [202603060001_initial_wargames.sql](/Users/djwayne/wargames/supabase/migrations/202603060001_initial_wargames.sql)

To support the full feature suite cleanly, add:

- `scenario_groups`
- `saved_views`

Recommended follow-up changes:

1. Add a `group_id` column to `scenario_features`, nullable in V1.
2. Expand `kind` to include `ring` now and `route` later.
3. Store canonical measurements in properties or dedicated numeric fields.
4. Persist style and analysis metadata explicitly, not only in ad hoc GeoJSON properties.

## Suggested Implementation Order

### Phase 1: Authoring and Organization

- scenario persistence
- layer management
- group model
- right-side inspector
- top action bar

### Phase 2: Core Analysis

- radius ring tool
- unit system
- improved measurement workflows
- saved views

### Phase 3: Routing and Presentation

- straight versus road route mode
- route duration summaries
- presentation mode
- snapshot export

### Phase 4: Advanced Analysis

- points-in-ring filters
- corridor generation
- isochrones
- optimized route ordering

## Suggested Acceptance Criteria

The suite is credible when all of the following are true:

- a user can place a point in one click
- a user can create a named group from selected points
- a user can draw or generate a `5 mi` or `10 km` ring from a point
- a user can switch display units without changing stored geometry
- a user can save and reload groups, layers, rings, and views
- a user can create a route through multiple points and see distance immediately
- a user can switch the same route from straight-line to road-aware mode
- a user can hide editing chrome and present the result cleanly

## Immediate Recommendation

If the product needs a concrete near-term scope, ship this first:

1. Scenario persistence
2. Layer management
3. Group management
4. Right-side inspector
5. Radius ring tool with presets and unit toggle
6. Saved views

That is the smallest complete feature slice that turns the map into a usable planning workspace rather than a single-session drawing surface.
