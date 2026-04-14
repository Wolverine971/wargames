# WarGames Next Iteration Assessment

Date: March 10, 2026

## Recommendation

The next iteration should be **authenticated scenario persistence with first-class layer management**.

That is the highest-value build because the current app already proves the authoring surface, but it still behaves like a local prototype. Until scenarios can be created, reopened, and organized as real records, every later investment in presentation mode, exports, unit modeling, or adjudication will sit on a weak foundation.

## What Is Already Strong

- The map authoring surface is credible now: coordinate plotting, draw tools, grid overlays, measurements, and fallback rendering are already in place.
- The visual direction is coherent and presentation-aware.
- Supabase groundwork already exists in schema, types, and client wiring.
- The codebase is currently healthy at a baseline level: `pnpm check` and `pnpm build` both pass.

## Evidence From The Repo

- Local draft state, map lifecycle, feature summaries, and the full page UI all live inside [`src/lib/map/OperationsMap.svelte`](../src/lib/map/OperationsMap.svelte), which is already 1,380 lines.
- Draft persistence is only browser storage today in [`src/lib/map/OperationsMap.svelte`](../src/lib/map/OperationsMap.svelte#L361).
- The UI explicitly says persistence is only "Supabase staged" in [`src/lib/map/OperationsMap.svelte`](../src/lib/map/OperationsMap.svelte#L1302).
- The server hook disables the SSR Supabase client entirely in [`src/hooks.server.ts`](../src/hooks.server.ts#L3).
- The database already has `scenarios`, `scenario_layers`, `scenario_features`, `simulation_runs`, and `presentation_briefs` with RLS in [`supabase/migrations/202603060001_initial_wargames.sql`](../supabase/migrations/202603060001_initial_wargames.sql#L13).
- The README still describes the backend as staged rather than implemented in [`README.md`](../README.md#L46).

## Current Gaps

### 1. No real scenario lifecycle

The product can draw and measure, but it cannot yet:

- sign in
- create a scenario record
- reopen prior work from a URL
- rename, duplicate, archive, or delete scenarios
- recover work across devices

That is the largest gap between "impressive prototype" and "usable tool."

### 2. The layer model exists only on paper

The schema already supports named layers with visibility and locking, but the UI still treats everything as one undifferentiated feature collection. That blocks the product from becoming a real planning workspace.

### 3. The implementation is too concentrated

`OperationsMap.svelte` currently owns:

- draft state
- persistence
- map initialization
- Mapbox and Leaflet fallback behavior
- feature synchronization
- selection logic
- most of the page UI

That concentration will make the next build slower and riskier unless state and data access are split into smaller modules.

### 4. Product trust signals are missing

There is no save status backed by the database, no dirty-state model, no route-level scenario identity, and no auth boundary. For a tool positioned as a planning workspace, those omissions matter more than adding another drawing feature.

### 5. Performance and test depth are still thin

- Production build passes, but it still emits a large client chunk warning, including a 1.76 MB chunk.
- There is no test suite covering draft serialization, feature hydration, or future persistence flows.

Those are not the first features to build, but they should be addressed inside the next iteration while the architecture is being opened up anyway.

## Recommended Scope For The Next Build

### Goal

Turn the app from a local drafting canvas into a reusable scenario workspace.

### Deliverable 1: Authenticated app shell

Add the minimum viable Supabase auth flow and route structure:

- sign in / sign out
- protected app area
- scenario list screen
- create scenario flow
- open scenario by ID or slug

Recommendation: use the simplest operator-friendly auth option first, such as Supabase magic-link email login.

### Deliverable 2: Scenario persistence

Persist and reload:

- scenario title
- briefing notes
- map view
- grid settings
- feature collection
- feature properties needed for styling and labels

This should include:

- initial load from Supabase
- explicit save plus autosave
- visible save status
- conflict-safe fetch/update behavior for a single-user model

### Deliverable 3: First-class layer management

Expose the existing schema through the UI:

- create layer
- rename layer
- set layer color
- reorder layers
- toggle layer visibility
- lock layer editing
- assign new features to the active layer

This is the right moment to introduce layers because persistence without organization will create clutter immediately.

### Deliverable 4: Refactor the map workspace before adding more product logic

Split the current monolith into at least:

- a scenario repository/service layer for Supabase reads and writes
- a workspace state store for draft and save state
- map rendering utilities or components
- sidebar/panel components separated from map engine concerns

The goal is not a broad rewrite. The goal is to remove the current bottleneck before more behavior is added.

### Deliverable 5: Minimum verification and performance pass

Add enough coverage to protect the new persistence slice:

- serialization/hydration tests for scenario data
- feature-to-database mapping tests
- one end-to-end happy path for sign in, create scenario, save, reload

Also use this iteration to reduce the current oversized client bundle if possible, especially if more UI routes are added.

## What Should Wait

These should come after persistence and layers:

- chrome-free presentation mode
- map snapshot export
- range rings and bearings
- unit and force modeling
- adjudication engine work
- realtime collaboration

Presentation mode is important, but it is more valuable once saved scenarios and named layers already exist.

## Proposed Acceptance Criteria

- An authenticated user can create a scenario and reopen it later from a stable route.
- Scenario title, briefing notes, grid settings, map view, and features persist to Supabase.
- The user can manage named layers and draw into the active layer.
- Locked layers cannot be edited.
- Visibility toggles affect both the map and the object summary UI.
- Reloading the page restores the saved scenario instead of depending on browser-local draft recovery.
- Local draft mode remains a graceful fallback when Supabase is not configured.

## Suggested Implementation Order

1. Stabilize Supabase session handling in the server hook and layout load path.
2. Add app routes for auth, scenario index, and scenario detail.
3. Create the scenario repository and data mapping layer.
4. Refactor workspace state out of `OperationsMap.svelte`.
5. Ship layer management and save status UI.
6. Add tests and do a bundle-size pass.

## Bottom Line

The project does **not** need more map tricks first. It needs a durable scenario workflow.

If the next iteration ships auth, scenario save/load, and real layers, the product crosses an important threshold: it becomes a usable operational workspace instead of a polished single-session demo.
