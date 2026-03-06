# WarGames Platform Design

Date: March 6, 2026

## Purpose

This system is a presentation-first war game workspace. It needs to let you build a scenario map quickly, brief it clearly, measure operational distance in kilometers, sketch routes and areas, and evolve into a deeper simulation platform over time.

The first implementation uses SvelteKit for the front end and Node runtime, Mapbox GL JS for the live operational map, and Supabase for persistence/auth/data services. The current UI direction is a clean tech-spec command interface rather than a consumer mapping product.

## Operator Goals

1. Build a scenario board fast enough to use live in planning or presentation.
2. Plot coordinates from latitude/longitude and military grid references.
3. Measure distance, sketch approaches, define control zones, and mark objectives.
4. Store scenarios, overlays, and briefing material so they can be reused.
5. Evolve from static map markup into adjudicated war game simulations.

## Current Starter Scope

Implemented in this repo now:

- SvelteKit + TypeScript + Node adapter project scaffold
- Mapbox GL JS map surface with kilometer grid overlay
- Draw controls for points, routes, and polygons
- Measurement summaries for route distance and area
- Coordinate plotting via lat/lng and MGRS
- Supabase client/server setup and starter schema types
- Local browser draft persistence for map state and briefing notes
- Design and schema docs to guide the next build phase

Not implemented yet:

- Authenticated save/load flows to Supabase
- Multi-user collaboration
- Unit/order-of-battle modeling
- Turn engine or adjudication rules
- Presentation export pipeline
- Offline package or air-gapped deployment profile

## Visual Direction

The interface should feel like an operations floor system:

- Dense but readable panels
- Crisp technical typography
- Low-glare dark field with cool line-work
- No ornamental consumer UI patterns
- Presentation-grade overlays that still feel credible in a planning context

This is inspired by mission systems and tech-spec interfaces rather than consumer GIS tools. The goal is clarity under pressure.

## Map Architecture

### Base Map

- Map engine: Mapbox GL JS
- Reasoning: strong vector rendering, custom layers, good interaction model, flexible styling
- Note: Google basemap integration is deferred. If you later need Google imagery or tiles, that should be evaluated separately because the terms, APIs, and rendering approach differ materially from Mapbox.

### Overlay Model

The map should treat everything as layers and features:

- Scenario base layers
- User-drawn operational overlays
- Unit/entity markers
- Terrain/intelligence overlays
- Measurement and planning artifacts
- Presentation annotations

Short term, GeoJSON is enough. Medium term, PostGIS-backed spatial querying is the right move once you need proximity, visibility, line-of-advance analysis, or multi-layer simulation lookups.

### Coordinate Systems

The platform should support at least:

- Latitude/longitude
- MGRS for military-friendly plotting
- Kilometer grid overlays for presentation and rough operational framing

Later additions worth planning for:

- UTM display
- Bearing and azimuth tools
- Range rings
- Elevation and line-of-sight analysis

## Supabase Role

Supabase should handle:

- User identity and scenario ownership
- Scenario persistence
- Feature/layer storage
- Simulation run records
- Briefing/presentation metadata
- Realtime collaboration later if needed

Suggested initial entities:

- `scenarios`
- `scenario_layers`
- `scenario_features`
- `simulation_runs`
- `presentation_briefs`

For early phases, store geometry as GeoJSON in `jsonb`. When you need richer geospatial analysis, move the hot paths to PostGIS-enabled structures.

## Simulation System Roadmap

### Phase 1: Authoring Surface

Goal: build reliable scenario authoring and briefing.

Needed capabilities:

- save/load scenarios
- layer visibility and locking
- richer annotation tools
- scenario presets and templates
- map capture/export
- asset library for unit symbols and icons

### Phase 2: Force and Terrain Model

Goal: represent the state of the war game, not just the map.

Needed models:

- units and formations
- force composition
- readiness and supply state
- command relationships
- objectives and constraints
- terrain modifiers
- named phases and decision points

### Phase 3: Adjudication Engine

Goal: run actual simulation turns and compare courses of action.

Needed components:

- time/turn model
- movement rules
- detection/intelligence rules
- fires/effects rules
- logistics consumption
- stochastic inputs where appropriate
- outcome logging and replay

### Phase 4: Presentation System

Goal: turn scenario state into a briefing product.

Needed outputs:

- COA comparison views
- timeline playback
- executive summary cards
- map snapshots with annotations
- export to PDF and slide-friendly assets

## Presentation Requirements

Because this is for presentations, the system should optimize for:

- clear map composition
- consistent classification/banner treatment
- legible overlays at a distance
- deliberate control over color and emphasis
- export-safe layouts
- a mode that hides editing chrome for clean screenshots

That last point matters. A dedicated presentation mode will likely be one of the highest-value next features after save/load.

## Security and Operating Assumptions

This starter is not a classified-data system. Before using it for anything sensitive, define:

- hosting boundary
- auth requirements
- audit logging
- encryption and backup policies
- offline/air-gapped operating model
- rules for ingesting real-world intelligence or location data

If this tool ever moves beyond hobby/training/demo use, those controls stop being optional.

## Immediate Next Build Steps

1. Add authenticated scenario save/load flows against Supabase.
2. Introduce named layers, icons, and editable annotations.
3. Add range rings, bearings, and route waypoint metadata.
4. Add presentation mode and exportable map snapshots.
5. Define the scenario/unit data model for simulation turns.
6. Stand up an adjudication service that can run turn logic and persist outcomes.

## Product Principle

Do not let this become a generic map toy. It should become a disciplined operational planning and briefing system that can grow into a real simulation platform without losing clarity.
