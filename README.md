# Trip Planner

Trip Planner is a responsive, spreadsheet-style workspace for building complex trips from normalized days, itinerary items, persisted places, and an optional primary Route A for each day.

## Current status

- Phase 1 and Phase 2 are complete.
- Phase 3 — live Google Maps and Places API (New) — is implemented. Persisted place snapshots, Advanced Markers, exact item/Pin selection, and the mobile map Sheet are live; the authenticated configuration smoke test is still pending.
- Phase 4 — Primary Route A Overview and optional manual Day routes — is implemented. Its migrations are applied and automated checks pass; the authenticated browser and deployed-configuration smoke test is still pending, so Phase 4 is not marked complete.

Route B/C variants, public sharing/export, and travel research remain intentionally deferred.

## Foundation stack

- Next.js 16 App Router and React 19
- Strict TypeScript and Zod
- Tailwind CSS 4, shadcn/ui primitives, and Lucide icons
- Supabase Auth/Postgres/RLS with `@supabase/ssr`
- TanStack Query for refresh, optimistic updates, and rollback
- `@vis.gl/react-google-maps` for the browser map
- date-fns and npm lockfile-based dependency management

Google SDK and API responses are normalized at provider boundaries. Browser Maps credentials and the server-only Routes credential have separate scopes.

## Architecture

The application is a modular monolith:

```text
src/
  app/                         Next.js routes, layouts, and global styles
  components/ui/               Shared shadcn/ui primitives
  features/
    itinerary/                 Matrix, item editing, planner loading, and orchestration
    maps/                      Provider-neutral map canvas and marker behavior
    places/                    Place autocomplete and persisted snapshots
    routes/                    Overview stages, route drafts, signatures, status, actions, and UI
  lib/
    providers/
      maps/
      places/
      routes/                  Server-only Google provider plus pure geometry/mapping
      travel/
  types/                       Generated database types
supabase/
  migrations/                  Forward-only schema, RPCs, RLS, and grants
```

`planner-workspace.tsx` remains a small orchestrator. Map derivation, Day route state, editor UI, route calculation, provider calls, and database loading live in focused modules.

The signed-in Supabase client is used for reads and mutations. Database authorization remains authoritative; client controls are not a security boundary.

## Itinerary matrix

The matrix is a projection of normalized records:

| Matrix column | Persisted source                  |
| ------------- | --------------------------------- |
| Date, Day     | `trip_days`                       |
| City          | `itinerary_items.type = location` |
| Activities    | `activity`                        |
| Transport     | `transport`, `flight`, `train`    |
| Hotel         | `hotel`                           |
| Car rental    | `car_rental`                      |
| Meals         | `meal`                            |
| Notes         | `note`                            |

A day may contain multiple items in each category. Nullable start/end times are passive itinerary metadata. Copies create independent item rows and do not copy Day route plans.

Matrix interactions include arrow and Tab navigation, Enter/Escape editing, range selection, clipboard replacement, Copy to days, Copy previous day, and deterministic Move up/down controls. No drag-and-drop is used.

## Phase 3 map and Places behavior

- Place-linked City, Activity, Hotel, Car rental, and Meal records load from persisted normalized place snapshots.
- Loading the planner does not make a Place Details request for every marker.
- Clicking an item selects its exact Pin; clicking/cycling a collocated Pin selects the exact item and matrix cell.
- Missing/invalid browser Maps configuration is isolated from matrix editing.
- Desktop/tablet landscape keeps the established split map. Tablet portrait/mobile retains the 100px map peek and opens the map in a bottom Sheet without losing matrix selection or horizontal scroll state.

## Phase 4 map model

The map has two levels, with **Overview** as the default.

### Overview

Overview derives stages only from persisted City places. It orders City items by trip day and manual item order, collapses consecutive entries with the same place into one stay stage, and connects the nearest explicitly entered stages across City-less days. It never infers or recommends a city and never optimizes the order.

Overview lines are client-side geodesic polylines. Opening Overview does not call the paid Google Routes API.

### Day route

A day has no route until the owner chooses **Create route**, configures at least two stops, and chooses **Save & calculate**. City, Transport, Car rental, Note, legacy Flight, and legacy Train records cannot be stops; only place-linked Activity, Meal, and Hotel items are eligible.

Manual stop order is authoritative. Item time, schedule, title, and notes never sort stops, validate a route, affect a signature, or enter a Google request. A time may appear beside a stop only as passive metadata.

One Hotel item may be referenced twice, exactly at the first and final positions. It remains one itinerary item and one physical Pin, with a combined label such as `1 · 5`. Other duplicate item references are rejected.

Travel mode belongs to each adjacent leg:

| Product mode                                             | Provider behavior |
| -------------------------------------------------------- | ----------------- |
| Walk                                                     | Google `WALK`     |
| Drive, Taxi, Rideshare                                   | Google `DRIVE`    |
| Bus, Subway, Tram, Shuttle, Train                        | Google `TRANSIT`  |
| Bike                                                     | Google `BICYCLE`  |
| Flight, Ferry, Cable car, Motorcycle, Other, and unknown | Straight fallback |

Unsupported modes never call Google. A straight fallback is dashed and uses tested Haversine distance; duration remains unknown. A genuine Google no-route response also falls back for that leg with a warning. Authentication, permission, quota, timeout, and systemic provider failures fail the recalculation and preserve the previous calculation snapshot.

Transit requests omit departure and arrival time. Returned Transit results are labeled as approximate current-service estimates rather than itinerary-time calculations. Walking and bicycle warnings are retained in normalized leg metadata.

Google legs render as solid forest-green Route A lines; fallback legs are dashed. Planned Pins are forest green and numbered, selected Pins have a white halo, and eligible unplanned Pins are neutral gray. Geometry and Pins are read-only: no waypoint creation, marker dragging, route dragging, route alternatives, or automatic optimization is enabled.

## Route calculation and caching

Saving desired route configuration and saving the latest successful calculation are separate operations. A stale previous line stays visible while a changed route is being calculated or if recalculation fails.

The deterministic Day route signature contains trip/day/variant identity, stop occurrences, item IDs, normalized coordinates, and ordered per-leg modes. It excludes display and schedule metadata. A complete signature hit makes zero provider calls. Otherwise unchanged per-leg signatures are reused and only changed supported legs call Google, with at most three provider calls in flight. Billable requests are never started on render and are not automatically retried.

Every Google-supported leg sends one request:

```text
POST https://routes.googleapis.com/directions/v2:computeRoutes
X-Goog-FieldMask: routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline
```

Requests use one origin and destination, `computeAlternativeRoutes: false`, no intermediate waypoints, no waypoint optimization, and no itinerary time.

## Local development

Requirements: Node.js 22+, npm 10+, and the Supabase CLI for database work.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable                               | Scope                         |
| -------------------------------------- | ----------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser/server                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server                |
| `NEXT_PUBLIC_SITE_URL`                 | Authentication redirects      |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`      | Browser Maps/Places only      |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`       | Browser Advanced Markers      |
| `GOOGLE_ROUTES_API_KEY`                | Server-only Google Routes API |

For Phase 3, enable Maps JavaScript API and Places API (New), create a Map ID, and restrict the browser key by HTTP referrer and those APIs.

For Phase 4, enable Routes API in the same Google Cloud project and create a separate server key restricted to Routes API only. Do not reuse the browser key, do not prefix the Routes key with `NEXT_PUBLIC_`, and do not apply browser-referrer restrictions to it. Stable server egress may use matching IP restrictions; typical serverless deployments do not guarantee a stable outbound IP, so retain the Routes-only API restriction and configure conservative quotas, monitoring, and budget alerts.

Add `GOOGLE_ROUTES_API_KEY` to the local server environment and the appropriate Vercel Development, Preview, and Production environments. Restart locally or redeploy after adding it.

## Supabase setup and migration status

The linked project used for Phase 4 was unambiguously identified as:

- Project name: `trip-planner`
- Project ref: `ewyefmnadibnampbeyzc`
- Organization: `pvdlssdladqoltgmixlx`
- Region: `us-west-2`

The forward-only migrations are applied and present in the linked migration history:

- `20260802130101_add_manual_day_route_plans.sql`
- `20260802130920_harden_manual_day_route_plans.sql`

The first adds normalized plans, independent stop references, per-leg modes, calculation snapshots, RLS, and owner-authorized RPCs. The second adds foreign-key indexes and removes broad legacy function execution grants found by the security advisor. Each remote dry run showed only its expected pending migration before it was pushed. No linked reset or remote seed was used.

Docker was unavailable during this phase, so the full local `supabase start` / local-only `supabase db reset` chain could not run. The migration was instead verified with linked dry runs, linked database lint, migration history, generated linked-schema types, direct table/grant/RLS inspection, and domain tests.

For future schema changes:

```bash
supabase migration new descriptive_name
supabase db push --linked --dry-run
supabase db push --linked
supabase gen types typescript --linked > /tmp/trip-planner-database.types.ts
```

Validate the temporary type file before replacing `src/types/database.ts`. Never run `supabase db reset --linked`.

### Route schema and authorization

- `day_route_plans` has one primary-variant plan per day.
- `day_route_stops` stores independent positional item references and intentionally has no `(plan_id, item_id)` uniqueness constraint.
- `day_route_legs` stores constrained user-facing per-leg modes and normalized adjacent stop references.
- `day_route_calculations` stores the latest complete successful snapshot separately from desired configuration.
- Day deletion cascades through plans, stops, legs, and calculations. Item deletion removes stop references and leaves the plan safely needing editing.
- Composite foreign keys and RPC checks keep trip, day, variant, stops, and items in the same Route A ownership scope.
- RLS is enabled on every route table. Authenticated trip members may read; only the authenticated trip owner may save, calculate, or clear Route A through narrowly granted RPCs.
- Route tables are not granted to `anon`; direct authenticated writes are not granted. Security-definer RPCs use a fixed empty `search_path`, explicit authorization, and explicit execution grants. No service-role key is used.

## Quality checks

```bash
npm test
npx tsc --noEmit
npm run lint
npm run format:check
npm run build
```

Automated coverage includes route-model contracts, RLS/grant/cascade migration contracts, category and duplicate validation, Overview ordering/collapse, per-leg mode mapping, Haversine and polyline geometry, narrow Google requests, no-route fallback, safe provider errors, full/partial cache reuse, stale/needs-edit state, nullable duration, server-key isolation, exact item/Pin selection, clipboard/copy behavior, and responsive Sheet/CSS contracts. Provider tests mock `fetch` and never call Google.

## Authenticated manual smoke test

This checklist remains pending until valid test-account access and the required deployed/local Google configuration are available.

1. Link places to City, Activity, Meal, Hotel, and Car rental items; refresh and confirm markers persist without per-marker Place Details calls.
2. Confirm exact matrix item ↔ Pin selection, including collocated items, mobile map peek, and expanded map selection preservation.
3. Confirm Overview contains only City stages, preserves same-day City order, collapses consecutive identical stays, and skips City-less days without inference.
4. Confirm Overview opening makes no Routes API request.
5. Confirm a day with no route remains quiet and shows only eligible gray places plus Create route.
6. Create a route from Activity, Meal, and Hotel items; start and end with the same Hotel and confirm one `1 · N` Pin.
7. Reorder only with Move up/down and configure mixed Walk, Transit, Drive, and unsupported fallback legs.
8. Save and calculate; confirm solid Google geometry, dashed fallbacks, summed distance, and incomplete total duration when any leg duration is unknown.
9. Refresh and confirm a complete cache hit makes no Google call. Change one leg and confirm only that leg calls Google.
10. Change only an item title/time and confirm Current status; change coordinates/order/mode and confirm Stale status.
11. Simulate missing/invalid key, permission, quota, timeout, and no-route responses; confirm only no-route falls back and all systemic failures retain the previous line.
12. Clear a place and delete a referenced item; confirm Needs editing without a matrix crash. Explicitly clear the route and confirm its line disappears.
13. Confirm Transit uses no itinerary time and is labeled as a current-service estimate; confirm walking/bicycle warnings.
14. Confirm Pins, route lines, and empty map locations cannot be dragged or used to add/reorder waypoints.
15. Confirm matrix editing works during every route state and route errors remain isolated.
16. Verify 1440×900, 1280×800, 1024×768, 834×1194, 768×1024, 390×844, and 430×932, including the 100px mobile peek and 44px controls.
17. Confirm no Routes key appears in browser source, props, serialized query data, or network payloads.
18. With a second account, confirm member read behavior and owner-only configuration/calculation/clear behavior.
19. Confirm there is no Route B/C UI, alternative chooser, schedule selector, time-order control, route preference, or waypoint optimization.
20. Log out and confirm protected routes redirect to login.

## Planned phases

1. ✅ Supabase, authentication, foundational schema, RLS, and trip CRUD
2. ✅ Core itinerary workspace, editing interactions, and responsive layouts
3. Google Maps and Places API (New) — implementation complete; authenticated smoke test pending
4. Primary Route A Overview and optional manual Day routes — implementation/database/automated checks complete; authenticated smoke test pending
5. Itinerary variants, Route B/C, and route comparison
6. Public read-only sharing and export
7. Travel research and along-the-way city recommendations
8. Offline, conflict, deployment, and operational polish

Each phase is independently implemented and verified. Phase 5 must not change Route A manual-order semantics or introduce Google alternative-route selection into Phase 4.
