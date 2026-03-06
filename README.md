# WarGames

Presentation-first operational mapping workspace built with SvelteKit, Node, TypeScript, Supabase, and Mapbox GL JS.

## What is included

- SvelteKit 2 app configured for the Node adapter
- TypeScript project setup
- Supabase browser/server client wiring and starter schema types
- Mapbox GL JS operations map with:
  - kilometer grid overlay
  - point plotting via lat/lng or MGRS
  - draw tools for lines and polygons
  - live kilometer and square-kilometer measurements
  - local draft persistence for presentation prep
- Markdown design doc for the broader simulation platform
- Starter Supabase SQL migration for scenarios, layers, features, runs, and briefs

## Environment

Copy `.env.example` to `.env` and populate:

```bash
PUBLIC_MAPBOX_ACCESS_TOKEN=
PUBLIC_MAPBOX_STYLE_URL=mapbox://styles/mapbox/dark-v11
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
```

## Run

```bash
pnpm install
pnpm dev
```

## Commands

- `pnpm dev` starts the SvelteKit dev server
- `pnpm build` builds the Node-targeted production bundle
- `pnpm preview` previews the Vite production build
- `pnpm check` runs `svelte-kit sync` and `svelte-check`

## Notes

- The current base map engine is Mapbox GL JS. Google basemap integration is intentionally not included in this first cut because Google map tile usage and licensing are materially different from Mapbox's rendering model.
- Supabase is wired in as the backend layer, but the starter currently keeps map drafts in browser storage until auth and scenario save flows are added.
- The platform design document lives at [docs/wargames-platform-design.md](/Users/djwayne/wargames/docs/wargames-platform-design.md).
