# Location Search Specification

Date: April 1, 2026

## Goal

Add a top-of-map location search experience that lets an operator type partial place names and jump the map directly to the selected geography.

Examples:

- Typing `Mary` should surface `Maryland, United States` as a high-confidence suggestion.
- Searching for places in China should return provinces, prefectures, cities, and other supported administrative places.
- Selecting a result should frame the full geography when bounds are available and otherwise fly to its center point.

## Why This Approach

The current application already uses Mapbox rendering and has a working map navigation path. It does not yet have any geocoder or type-ahead implementation.

This feature should use the Mapbox Geocoding API v6 instead of a second provider because:

- it matches the existing public Mapbox token model already used by the app
- it supports global administrative feature types such as `country`, `region`, `district`, `place`, `locality`, and `neighborhood`
- it supports autocomplete, `proximity` biasing, bounding boxes, and multilingual queries
- it can support China, which rules out Mapbox Search Box as the primary API today

## Scope

### In Scope

- A search bar in the top map overlay
- Type-ahead suggestions for countries, states/provinces, prefectures/districts, cities, and localities
- Keyboard navigation with arrow keys, `Enter`, and `Escape`
- Result selection that moves the map immediately
- Administrative-first query behavior so short prefixes favor geographies over street addresses
- Reuse of the current Mapbox token with no new backend dependency

### Out of Scope

- Business and POI search
- Permanent storage of geocoding results
- Reverse geocoding from map clicks
- Server-side caching or a custom geocoding proxy
- Multi-provider fallback in this first implementation

## UX Requirements

### Search Bar

- Position: top overlay on the map surface
- Placeholder: clearly indicate support for countries, regions, and cities
- Minimum query length: 2 characters
- Debounce: approximately 250 to 300 ms
- Default result count: 8

### Suggestions

Each suggestion should show:

- primary label, such as `Maryland`
- secondary geography, such as `United States`
- feature type badge, such as `Region` or `Place`

Result ordering should preserve provider quality but slightly favor administrative features for short prefix matches.

### Selection Behavior

- If the result includes a `bbox`, fit the map to that extent.
- If the result is point-only, fly to the coordinate.
- Keep the search input populated with the chosen canonical label.
- Do not create a plotted feature on selection in v1. Selection is navigation only.

## Data Contract

The UI should normalize provider results into a compact client-side shape:

```ts
type LocationSearchSuggestion = {
  id: string;
  featureType: string;
  name: string;
  subtitle: string;
  fullName: string;
  center: [number, number];
  bbox?: [number, number, number, number];
  countryCode?: string;
};
```

## Provider Query Strategy

Use the Mapbox Geocoding API v6 forward geocoding endpoint with:

- `autocomplete=true`
- `limit=8`
- `types=country,region,district,place,locality,neighborhood`
- `language=en,zh_Hans`
- `proximity=<current map center>` when available

Notes:

- The implementation should not cache results. The Mapbox Geocoding API defaults to temporary geocoding.
- `bbox` should be used for framing countries, states, provinces, districts, and cities when present.
- `proximity` is bias only, not a hard filter, so global search still works.

## Integration Plan

### New Modules

- `src/lib/map/locationSearch.ts`
  - provider request and response normalization
  - light post-ranking for admin-first prefix matches
- `src/lib/map/LocationSearch.svelte`
  - input, debounce, keyboard navigation, suggestion dropdown

### Workspace Integration

Update `src/lib/map/OperationsMap.svelte` to:

- render the search component inside the top overlay
- pass the current map center as search bias
- fit bounds on administrative selections
- fly to point results

## Acceptance Criteria

- Typing `Mary` produces `Maryland, United States` in the suggestion list.
- Searching for Chinese geographies returns valid suggestions when supported by Mapbox coverage.
- Selecting a state or province frames the area instead of zooming to an arbitrary point.
- Selecting a city or locality flies the map directly to that place.
- The feature works in both Mapbox GL mode and Leaflet raster fallback mode.
- `pnpm check` passes after the change.

## Future Extensions

- Optional country filter chips
- POI search mode using a separate provider path
- Reverse geocoding for clicked coordinates
- Operator-selectable worldview and language preferences
