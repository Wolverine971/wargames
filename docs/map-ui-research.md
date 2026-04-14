# Map UI Research

Date: April 4, 2026

## Objective

Refine the map authoring experience so an operator can:

- drop a point quickly
- show 5 mile, 10 mile, or kilometer-based radius rings immediately
- measure distances and areas without mode confusion
- view and analyze routes, including road-aware routes between multiple points

## Current Repo Baseline

The current app already has most of the rendering foundation:

- `Mapbox GL JS` is the primary renderer and `Leaflet` is the raster fallback.
- `@mapbox/mapbox-gl-draw` is enabled for lines, polygons, and delete in the map toolbar.
- point plotting exists, but it is split between the left-side coordinate plotter and a separate map click mode.
- summaries already calculate line distance in kilometers and polygon area in square kilometers.

Relevant local references:

- [/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte](/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte#L154)
- [/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte](/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte#L1093)
- [/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte](/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte#L1318)
- [/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte](/Users/djwayne/wargames/src/lib/map/OperationsMap.svelte#L1457)
- [/Users/djwayne/wargames/src/lib/map/metrics.ts](/Users/djwayne/wargames/src/lib/map/metrics.ts#L55)
- [/Users/djwayne/wargames/docs/wargames-platform-design.md](/Users/djwayne/wargames/docs/wargames-platform-design.md#L82)

The gap is mostly interaction design, not engine capability.

## What Palantir Gaia Gets Right

Public Palantir map docs point to a clear task-first interface model:

- left side panels for `Layers`, `Find`, `Histogram`, and `Info`
- right side panels for `Selection` and `Time Selection`
- a top toolbar for `Select`, `Search Around`, `Draw`, `Measure`, `Annotate`, `Capture`, and `Delete`

Gaia also exposes the exact radius workflow you described:

- open `Draw`
- choose `Circle`
- click a center point
- enter a distance value
- choose the unit such as `km`
- use that geometry directly for search and analysis

Palantir also emphasizes selection-based workflows: objects and drawn results appear as layers, and selection details/actions stay visible on the right.

The core lesson is that Gaia treats mapping actions as first-class tasks, not as low-level geometry editing.

## Leaflet vs. Mapbox

### Leaflet

Leaflet is good at simple, transparent map interactions:

- native support for markers, polylines, and circles
- circles use radius in meters
- easy to fit bounds and attach lightweight controls
- excellent plugin ecosystem

Leaflet is weaker when you want a polished, dense, analysis-heavy map UI with custom vector styling and high-end interaction states.

Routing is not a Leaflet core feature. You need a routing service or plugin on top. `Leaflet Routing Machine` supports via points and can use routing engines such as OSRM or Mapbox Directions.

Use Leaflet when:

- you want a lighter open-source stack
- your overlays are simple
- you are comfortable assembling plugins for routing and editing

### Mapbox

Mapbox is the better fit for this repo's direction:

- strong vector rendering and styling
- good support for layered operational overlays
- direct APIs for directions, optimization, travel-time analysis, isochrones, and map matching
- easier path to a more "system-like" interface similar to Gaia

Mapbox also aligns with the current codebase and token model already in use.

## Capability Mapping

### 1. Drop a marker and show 5 mi / 10 mi / km rings

This is straightforward with the existing stack.

Recommended implementation:

- keep a point marker as the center
- store ring sizes internally in meters
- render one or more ring polygons or circles from that point
- display unit presets like `1 mi`, `5 mi`, `10 mi`, `25 km`, `50 km`
- allow a custom numeric input plus a unit toggle

For rendering:

- `Leaflet` has built-in circles with radius in meters
- `Mapbox GL JS` can render ring polygons from GeoJSON
- `Turf` can generate buffers/rings in miles or kilometers and keep the math consistent

Important UX detail:

- treat `radius` and `diameter` as separate user concepts, but store only `radiusMeters`
- if the user selects diameter, divide by two immediately and keep the UI label explicit

### 2. Fast measurement workflow

Your current app already calculates line distance and polygon area, but the UX is indirect.

Recommended interaction:

- single `Measure` action in the top overlay
- sub-modes: `Distance`, `Area`, `Radius Ring`, `Bearing`
- persistent unit control visible at all times: `Metric`, `Imperial`, `Nautical`
- selection inspector that shows exact values for the currently selected feature

Store canonical values in metric units:

- `distanceMeters`
- `areaSqMeters`
- `radiusMeters`

Convert only for display.

### 3. Road-aware route between up to ten points

This is possible without switching engines.

Ordered route case:

- use `Mapbox Directions API`
- it supports between 2 and 25 coordinates in order
- it can return route geometry and turn-by-turn steps

Optimized stop order case:

- use `Mapbox Optimization API v1`
- it supports between 2 and 12 coordinates
- it returns a duration-optimized trip and reordered waypoints

Travel-time analysis case:

- use `Mapbox Matrix API`
- it returns travel times and distances between many points
- it does not return route geometries

Freehand route snapped to roads case:

- use `Mapbox Map Matching API`
- it snaps traces to the road network
- it supports 2 to 100 coordinates

Distance-by-road reachability case:

- use `Mapbox Isochrone API`
- it supports both `contours_minutes` and `contours_meters`
- this is better than a simple radius circle when the question is "how far can I drive" rather than "what is 10 miles as the crow flies"

### 4. When Google becomes worth it

Google is worth considering if road-network behavior becomes the main product value.

Useful Google capabilities:

- `Routes API computeRoutes` supports up to 25 intermediate waypoints
- `optimizeWaypointOrder` can reorder intermediate stops
- route responses include polylines
- `Roads API snapToRoads` accepts up to 100 points and can interpolate to smooth the snapped line

Google is a good choice if you specifically want:

- Google road coverage and route behavior
- tight integration with Google Places and road snapping
- a route-first UX rather than a custom geospatial authoring surface

It is not necessary yet just to deliver the UX you described.

## Product Recommendation

### Recommendation

Keep `Mapbox GL JS` as the primary engine and build a Gaia-inspired task model on top of it.

Do not switch the base interaction model to Leaflet.

Do not add Google first.

### Why

- your repo already uses Mapbox and has the basic authoring surface in place
- Mapbox already covers radius rings, ordered routes, optimized routes for ten points, map matching, and isochrones
- the main problem is discoverability and mode friction, not missing map primitives

## Recommended UX Shape For This App

### Top action bar

Replace the current split workflow with a compact action bar:

- `Add Point`
- `Radius Ring`
- `Route`
- `Area`
- `Measure`
- `Search`
- `Layers`

### Left rail

Adopt Gaia's left-rail pattern:

- `Layers`
- `Find`
- `Analysis`
- `Saved`

`Analysis` should include:

- ring presets
- unit toggle
- route mode toggle: `Straight` or `Road`
- measure summaries

### Right inspector

Selection-driven detail panel:

- selected feature name
- exact coordinates
- radius, diameter, distance, area
- unit conversion display
- route distance and duration
- quick actions: duplicate, rename, recolor, delete

### Map behavior

Preferred direct actions:

1. Click `Radius Ring`
2. Click map once
3. Immediate default ring appears, such as `10 km`
4. Small inline chip lets the user switch to `5 mi`, `10 mi`, `25 km`, or custom

For routes:

1. Click `Route`
2. Click multiple points on the map
3. Toggle `Straight` or `Road`
4. Show total distance immediately
5. If `Road` is on, request the snapped route and return duration as well

## Suggested Build Order

1. Add a first-class `Radius Ring` tool with presets and a unit toggle.
2. Add a persistent unit system for metric, imperial, and nautical display.
3. Add a right-side selection inspector for per-feature analysis.
4. Add `Route` mode with `Straight` and `Road` variants.
5. Add `Mapbox Directions API` integration for ordered road routes.
6. Add `Optimization API` only if you need waypoint reordering.
7. Add `Isochrone API` if you want drive-time or walk-time zones, not just geometric circles.

## Bottom Line

You do not need a new map engine to get the workflow you want.

You need:

- a task-first UI
- first-class radius/ring tooling
- visible unit controls
- selection-based analysis panels
- optional road-network enrichment through Mapbox navigation APIs

That gets you much closer to the Gaia feel while staying aligned with the current repo.

## Sources

- [Palantir Map overview](https://www.palantir.com/docs/foundry/map)
- [Palantir Map interface overview](https://www.palantir.com/docs/foundry/map/map-overview)
- [Palantir Map getting started](https://www.palantir.com/docs/foundry/map/getting-started)
- [Palantir Gaia data search](https://www.palantir.com/docs/foundry/geospatial/add-ontology-data-to-gaia)
- [Palantir point displays](https://www.palantir.com/docs/foundry/map/visualize-points)
- [Palantir map settings](https://www.palantir.com/docs/foundry/map/settings)
- [Leaflet reference](https://leafletjs.com/reference)
- [Leaflet Routing Machine](https://www.liedman.net/leaflet-routing-machine/)
- [Mapbox Markers API](https://docs.mapbox.com/mapbox-gl-js/api/markers/)
- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- [Mapbox Optimization API v1](https://docs.mapbox.com/api/navigation/optimization-v1/)
- [Mapbox Matrix API](https://docs.mapbox.com/api/navigation/matrix/)
- [Mapbox Isochrone API](https://docs.mapbox.com/api/navigation/isochrone/)
- [Mapbox Map Matching API](https://docs.mapbox.com/api/navigation/map-matching/)
- [Mapbox directions UI example](https://docs.mapbox.com/mapbox-gl-js/example/mapbox-gl-directions/)
- [Mapbox Geocoding API](https://docs.mapbox.com/api/search/geocoding/)
- [Turf buffer](https://turfjs.org/docs/api/buffer)
- [Google Routes API computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)
- [Google route polylines](https://developers.google.com/maps/documentation/routes/traffic_on_polylines)
- [Google Roads API snapToRoads](https://developers.google.com/maps/documentation/roads/snap)
