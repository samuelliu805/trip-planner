# Trip Planner

Trip Planner is a responsive, spreadsheet-style workspace for building complex trips from normalized days, itinerary items, persisted places, route variants, and optional manual routes for each active-variant day.

## Current status

- Phase 1 and Phase 2 are complete.
- Phase 3 — live Google Maps and Places API (New) — is implemented. Persisted place snapshots, Advanced Markers, exact item/Pin selection, and the mobile map Sheet are live; the authenticated configuration smoke test is still pending.
- Phase 4 — Primary Route A Overview and optional manual Day routes — is implemented. Its migrations are applied and automated checks pass; the authenticated browser and deployed-configuration smoke test is still pending, so Phase 4 is not marked complete.
- Phase 5A — Route Variant Foundation — is implemented. Its forward-only migration is applied to the linked project, linked integration/domain checks and all repository checks pass, and unauthenticated responsive shell checks pass. The authenticated product checklist remains pending.
- Phase 5B — read-only Route Variant comparison — is implemented without a schema migration or new cloud configuration. Focused comparison and repository checks pass; authenticated comparison and responsive acceptance remain pending.
- Phase 5C — Route Variant Decision Summary — is implemented without a schema migration or new cloud configuration. The lightweight projection, current-signature aggregation, neutral Primary deltas, desktop panel, and mobile Summary Sheet are covered by automated checks; authenticated responsive acceptance remains pending.

Phase 6 public sharing/export and later travel research remain intentionally deferred.

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
    variants/                  Active resolution, lifecycle actions, query state, and responsive controls
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

Matrix interactions include arrow and Tab navigation, Enter/Escape editing, range selection, clipboard replacement, Copy to days, Copy previous day, deterministic Move up/down controls, and multi-cell clearing. Backspace/Delete and the editing toolbar both open one compact confirmation that states the item count and saved-route impact; the confirmed delete is one owner-authorized database transaction with optimistic rollback. A confirmation is used instead of a misleading undo because recreating deleted item IDs would not faithfully restore saved route references. No drag-and-drop is used.

## Phase 3 map and Places behavior

- Place-linked City, Activity, Hotel, Car rental, and Meal records load from persisted normalized place snapshots.
- Loading the planner does not make a Place Details request for every marker.
- Clicking an item selects its exact Pin; clicking/cycling a collocated Pin selects the exact item and matrix cell.
- Missing/invalid browser Maps configuration is isolated from matrix editing.
- Desktop/tablet landscape keeps the established split map. Tablet portrait/mobile retains the 100px map peek and opens the map in a bottom Sheet without losing matrix selection or horizontal scroll state.

## Phase 4 map model

The map has two levels, with **Overview** as the default. The planner initially selects the first day's City cell so the starting map context and spreadsheet selection agree without highlighting an arbitrary City item.

### Overview

Overview derives one stage for every persisted City item. It orders City items by trip day and manual item order, preserves multiple Cities on one day, labels each marker with that stage's first date (or `Day N` when dates are unset), and connects the nearest explicitly entered stages across City-less days. Neighboring City items on the same day must use different map places. When one day's final City matches the next City occurrence on another day, both stages remain visible but the stay boundary is not treated as a route leg: it has no transport control, line, or Routes API request. Overview never infers or recommends a city and never optimizes the order.

Overview initially connects City stages with dashed straight previews, so opening the map remains free of paid route calls. Each connection is limited to Drive, Flight, Train, Bus, or Bike. Its default comes from Transport items on the arrival City stage's first day, with Flight > Drive > Train > Bus > Bike priority when several exist; otherwise distances of at least 500 km default to Flight and shorter distances default to Drive. The compact Overview panel hides City pairs and leg metrics by default. **Calculate route** expands one clean list where the owner chooses transport and sees each City pair, distance, and duration; **Not set** keeps that connection as a straight preview. Calculation remains explicit and processes only configured, changed connections. Drive, Train/Bus, and Bike use the same server-only Google Routes provider as Day routes; Flight and unavailable routes retain a dashed straight fallback. Overview calculations are session-scoped rather than persisted.

### Day route

A day has no route until the owner chooses **Create route**, configures at least two stops, and chooses **Save & calculate**. City, Transport, Car rental, Note, legacy Flight, and legacy Train records cannot be stops; only place-linked Activity, Meal, and Hotel items are eligible.

When a day contains at least two City stages, Day route also overlays their transfer path in blue while the Activity/Hotel/Meal Route A path remains forest green. **All**, **City transfers**, and **Day stops** filters control those two visualization layers; both are shown by default. The City layer reuses the current session's Overview calculations and remains a dashed preview where an Overview leg is not calculated. It does not make City items eligible Day route stops.

Map place actions stay inline in the compact selected-place row. Closing a view panel dismisses the complete panel and clears its Pin selection; a compact bottom-left Route details/Overview details control restores it without changing map mode. The Day route editor uses a down-chevron to discard unsaved draft changes and return to the preceding route summary. Unplanned places start expanded, with compact icon actions for adding, moving, removing, editing, and resetting route choices; the consequential Save & calculate action remains explicitly labeled.

Route controls use forest-filled buttons only for the next primary commitment, outlined white controls for secondary edit/add/detail actions, quiet ghost controls for navigation and dismissal, and red ghost controls for destructive removal.

Manual stop order is authoritative. Item time, schedule, title, and notes never sort stops, validate a route, affect a signature, or enter a Google request. A time may appear beside a stop only as passive metadata.

One Hotel item may be referenced twice, exactly at the first and final positions. It remains one itinerary item and one physical Pin, with a combined label such as `1 · 5`. Other duplicate item references are rejected.

The Hotel shortcut is available only when both the immediately previous day and active day contain a place-linked Hotel. It uses the previous day's Hotel as the locked first stop and today's Hotel as the final stop; activities and meals added afterward are inserted between those endpoints. The database accepts the previous-day Hotel only in position 1, while every other stop remains scoped to the active day and variant.

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

## Phase 5A route variants

A Route Variant is a complete independent planning branch, not a Google road alternative. The planner stays at `/trips/[tripId]`; a valid `/trips/[tripId]?variant=[variantId]` selects that trip's active variant, while a missing or invalid query falls back to the single primary variant. Broken legacy data without exactly one primary returns an explicit error. The initial request loads the lightweight variant list plus only the active variant's complete workspace.

The compact header control always pairs color with the variant name. Desktop/tablet landscape shows the textual **Primary** badge in the trigger and uses a dropdown plus dialogs. Tablet portrait/mobile uses a quieter 44px route-name trigger and bottom Sheet; the Sheet and management list retain the textual **Primary** label, and only one variant is editable. The route dropdown is portaled above the sticky Matrix header. A trip can contain at most three variants, enforced by a database trigger and every creation RPC.

Variant lifecycle operations are owner-authorized database transactions:

- Blank creation copies the source variant's day numbers and dates, intentionally clears day title/notes, and creates no itinerary items, saved Day route plans, or calculations.
- Duplication creates new IDs for the variant, days, items, links, plans, stops, and legs. It remaps every relationship, preserves item metadata, place references, stop occurrences (including a duplicate first/final Hotel), and leg modes, but does not copy `day_route_calculations` or create `places` rows.
- Rename/color updates may render optimistically but roll back on failure. Names are trimmed, limited to 80 characters, and unique case-insensitively within the trip; colors use validated six-digit hex values.
- Setting primary atomically unsets the preceding primary and sets the target, with a deferred database invariant requiring exactly one primary at commit. The client updates the badge immediately with rollback, then reloads the authoritative list and announces the successful change.
- Deletion rejects the primary and final variant, cascades through variant-owned days/items/links/routes/calculations, and leaves trip-level places intact.

Planner and Route A caches use `['planner', tripId, variantId]`. Every item/day/route mutation carries and validates the active variant. Switching variants uses browser history and remounts the variant workspace, clearing matrix selection, selected items/Pins, map mode/viewport projection, panels, and unsaved Day route drafts. Creation, duplication, switching, rename/color, primary changes, and deletion never call Google Routes; calculation remains explicitly user-triggered.

Variant UI is organized by responsibility: the coordinator owns navigation and open state, while desktop/mobile switching, create/duplicate/edit, identity rendering, and primary/delete management live in focused components. Planner clipboard/keyboard event handling, clear confirmation, and server-side item validation are likewise isolated from the workspace and mutation coordinators. Obsolete pre-variant loaders, copy aliases, placeholder provider contracts, and unused shared type/config modules were removed after a repository-wide reference audit.

## Phase 5B route comparison

Comparison is a read-only projection of complete Route Variants, not another Matrix workspace and not a Google route-alternative chooser. The URL-selected variant remains the only editable variant. At every viewport, the comparison map overlays the locally visible variants; the active variant is always visible, visually strongest, and above inactive read-only markers and lines. The route controls pair stored color with variant name, Primary, Editing/Read only, Visible/Hidden, and the explicit City sequence, so identity never depends on color alone. The desktop legend has one close action that exits comparison rather than a redundant hide/reopen cycle.

The lazy `['variant-comparison', tripId]` query loads only `route_variants`, ordered `trip_days`, City `itinerary_items`, and their referenced persisted `places` snapshots. It retains City-less days and variants with no place-linked Cities, but does not load non-City items, item links, Day route plans/stops/legs/calculations, or provider data. The active complete workspace remains solely in `['planner', tripId, activeVariantId]`; inactive complete workspaces are never created or cached for comparison. RLS on the existing tables remains the authorization boundary.

Comparison reuses the Overview City-order and stay-boundary rules: manual day/item order, multiple Cities in one day, City-less days, repeated explicit later occurrences, coordinate validation, and cross-day same-place no-travel boundaries are preserved. It never infers or optimizes a stage. Every comparison leg is a provider-neutral dashed straight two-point preview with a variant-scoped object ID. The UI identifies these lines as City order, not driving directions. Session-calculated Overview geometry is active-workspace, in-memory state and therefore has no equivalent inactive-variant snapshot; persisted Day route geometry has a different per-day meaning. Both are intentionally ignored so every variant uses the same visual basis and entering, filtering, or refetching comparison makes zero Google Routes requests. Per-variant calculation buttons are intentionally omitted; normal explicit Overview calculation remains available outside comparison.

Below 900px, comparison opens the expanded map with the same multi-variant overlay as desktop. A single **Routes** button opens the bottom Sheet for show/hide controls; closing those controls returns to the map, while closing the expanded map exits comparison. The compact context states `Matrix: Route A · Map: read only`, avoiding a second preview mode or any suggestion that an inactive map route is editable. The mobile Matrix disables boundary overscroll so its sticky header and date columns do not rubber-band when a swipe reaches an edge. Loading and failure stay scoped to comparison, with Retry on failure, while the Matrix remains usable.

Comparison is disabled until a trip has at least two variants. It is also disabled while the existing Day route editor contains an open draft, requiring the owner to use the established save or discard behavior before entering comparison. Rename, recolor, primary, lifecycle, City item/order, and day mutations reconcile or invalidate comparison data; unrelated item edits avoid comparison invalidation where practical.

## Phase 5C route decision summary

Decision summary is a factual, read-only layer inside Phase 5B comparison. It uses the Primary variant as the stable baseline and labels every non-primary difference as vs Primary. A positive or negative delta is neutral: it never means better, worse, winner, loser, score, or recommendation. The URL-selected variant remains the only editable Matrix.

The lazy ["variant-decision-summary", tripId] query is independent from the Phase 5B City projection and from every full planner workspace. It loads only variant identity, persisted days, the item types and place fields needed by summary metrics, and normalized saved Day route plans/stops/legs/calculations. It does not load item links, notes, booking data, provider payloads, or inactive PlannerWorkspace objects. Existing table RLS remains the authorization boundary.

Summary metrics use these definitions:

- City sequence follows Phase 5B manual day/item order and stay-boundary behavior, but collapses adjacent occurrences of the same normalized City place for readability. City stage count still includes every explicit City occurrence; unique City count deduplicates normalized place identity.
- Days count persisted variant days. Nights are day count minus one only when every date exists and the ordered dates are one continuous daily sequence. Hotel items never infer nights. If no compared variant has known nights, the Nights row is omitted instead of repeating an unknown value.
- Unique planned places deduplicate non-null persisted place IDs across City, Activity, Meal, Hotel, and Car rental items. The occurrence count remains available as supporting detail.
- City span · straight-line is the Haversine sum across Phase 5B explicit City Overview legs, including City-less-day behavior and excluding same-place cross-day no-travel boundaries. It is never driving distance and is omitted when unavailable for every compared variant.
- Saved route distance is displayed by explicit current leg mode—Walk, Drive, Train, Bus, and the other supported product modes—rather than as one aggregate Day-route number. A calculation is current only when its persisted config signature matches the signature reconstructed from current saved stops, coordinates, occurrence order, and per-leg modes. Stale, uncalculated, needs-editing, and updating plans are counted but excluded from every mode total.
- Mode distance includes Google and explicit straight-fallback legs because both carry persisted distance. The provider mode never replaces the saved product mode. Aggregate Day-route duration is not shown, and the entire mode-distance section is omitted when every compared variant lacks a current calculated distance.
- Route coverage shows saved-plan status counts, current calculated legs, fallback legs, no-route fallbacks, and unsupported-mode fallbacks. Saved Day route modes come from current persisted route legs.
- Trip transport modes come only from explicit Transport, legacy Flight, and legacy Train items. Provider mode and distance never infer a product mode.
- Hotel comparison treats each explicit Hotel item as an occurrence, using place ID first and normalized title only when no place ID exists. Occurrences align to Primary by actual date when both corresponding days are dated, otherwise by day number; multiple Hotels on one day remain distinct and produce same, changed, added, and removed detail.

City span and saved per-mode route distances are separate metrics and are never added together. Empty all-variant metric groups are suppressed; if at least one variant has a known value, another variant may still show a precise unavailable/not-calculated state. Opening, retrying, refetching, or expanding the summary performs no Google Routes, Place Details, route-alternative, or automatic calculation request.

At 900px and wider, Decision summary is a collapsible panel within the comparison map and shows at most three compact variant columns. Below 900px, Summary is a separate bottom Sheet alongside, not inside, the existing Routes visibility flow. The Matrix remains horizontally scrollable and editable for the active URL variant; opening either summary surface does not switch variants or update the URL. Primary, Editing, Read only, partial, stale, excluded, unknown, and unavailable states are textual and do not rely on color.

Phase 5C uses the existing schema and requires no migration. Relevant item/day/variant/route mutations invalidate the summary query; note-only edits avoid invalidation where practical. Authoritative variant identity reconciles cached projections after rename, recolor, primary, create, or delete operations.

## Local development

Requirements: Node.js 22.21+, npm 10+, and the Supabase CLI for database work.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The `dev` and `start` scripts enable Node's environment-proxy support. When outbound HTTPS requires a proxy, set standard `HTTPS_PROXY`, `HTTP_PROXY`, and `NO_PROXY` variables in the shell before starting the server, then restart it. These machine-level variables are intentionally not stored in `.env.local` or exposed to the browser.

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

The linked project used for Phase 5A was unambiguously identified as:

- Project name: `trip-planner`
- Project ref: `ewyefmnadibnampbeyzc`
- Organization: `pvdlssdladqoltgmixlx`
- Region: `us-west-2`

The forward-only migrations are applied and present in the linked migration history:

- `20260802130101_add_manual_day_route_plans.sql`
- `20260802130920_harden_manual_day_route_plans.sql`
- `20260803173303_route_variant_foundation.sql`
- `20260803183257_allow_previous_day_hotel_route_start.sql`

The Phase 5A migration adds the three-variant and exactly-one-primary invariants, case-insensitive names, atomic lifecycle/duplication/day RPCs, active-variant Day route support, and narrow execution/table grants. The follow-up migration narrowly permits an immediately previous-day Hotel as Day route position 1 and adds atomic owner-authorized clearing for selected Matrix items. Its dry run showed only `20260803183257_allow_previous_day_hotel_route_start.sql`; it applied successfully, and the final linked list shows local/remote alignment. No linked reset or remote seed was used.

Phase 5B uses the existing read grants, RLS policies, variant/day/item/place tables, and relationships. It required no migration; no empty migration was created and `supabase db push --linked` was not run for this phase. The linked migration list remained fully aligned through `20260803183257`, with no local-only or remote-only entry.

Docker was unavailable during this phase, so the CLI database-test runner could not complete. The same rollback-wrapped 38-assertion pgTAP SQL completed through the linked database interface, including the previous-day Hotel and atomic-clear contracts, and follow-up queries confirmed zero fixture trips/users remained. Verification also used linked dry run/push/list, linked database lint, security advisors, generated linked-schema types, static migration contracts, and application domain tests.

For future schema changes:

```bash
supabase migration new descriptive_name
supabase db push --linked --dry-run
supabase db push --linked
supabase gen types typescript --linked > /tmp/trip-planner-database.types.ts
```

Validate the temporary type file before replacing `src/types/database.ts`. Never run `supabase db reset --linked`.

### Route schema and authorization

- `day_route_plans` has at most one plan for each active-variant day.
- `day_route_stops` stores independent positional item references and intentionally has no `(plan_id, item_id)` uniqueness constraint.
- `day_route_legs` stores constrained user-facing per-leg modes and normalized adjacent stop references.
- `day_route_calculations` stores the latest complete successful snapshot separately from desired configuration.
- Day deletion cascades through plans, stops, legs, and calculations. Item deletion removes stop references and leaves the plan safely needing editing.
- Composite foreign keys and RPC checks keep trip, day, variant, stops, and items in the same active-variant ownership scope.
- RLS is enabled on every route table. Authenticated trip members may read; only the authenticated trip owner may manage variants or save, calculate, or clear the active variant's route through narrowly granted RPCs.
- Route tables are not granted to `anon`; direct authenticated writes are not granted. Security-definer RPCs use a fixed empty `search_path`, explicit authorization, and explicit execution grants. No service-role key is used.

## Quality checks

```bash
npm test
npx tsc --noEmit
npm run lint
npm run format:check
npm run build
```

The latest Phase 5A verification completed with `npm test` (57/57 tests), `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, and `npm run build`. Linked database lint reported no schema errors. The rollback-wrapped database suite contains 38 assertions covering new IDs/mappings, shared place IDs, duplicate and previous-day Hotel occurrences, leg modes, omitted calculations, source isolation, maximum/unique/primary/delete/cross-trip rules, atomic cell clearing, grants, and RLS. Provider tests mock `fetch` and never call Google.

The Phase 5B verification completed with `npm test` (62/62 tests), `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, and `npm run build`. Comparison coverage includes the City-only projection contract, deterministic/stay-boundary derivation, straight dashed provider-neutral presentation, active/inactive emphasis, read-only marker identity, responsive editing/visibility separation, state reconciliation, cache invalidation, and the absence of comparison route-provider calls.

The Phase 5C verification completed with `npm test` (75/75 tests), `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, and `npm run build`. Focused coverage includes the lightweight trip-scoped/RLS projection contract, adjacent City-sequence collapse without changing stage counts, Haversine span, all-unknown metric suppression, planning horizons, planned-place deduplication, current-signature per-mode route distance, stale/uncalculated/needs-editing exclusion, fallbacks, explicit travel modes, Hotel occurrence alignment, neutral deltas, query reconciliation/invalidation, responsive summary surfaces, and the absence of summary provider calls. `supabase migration list --linked` reported all 12 local migrations matched remotely with no pending migration; no schema push was run.

Headless Chrome loaded the current unauthenticated application at 1440×900, 1280×800, 1024×768, 834×1194, 768×1024, 390×844, and 430×932 without a blank screen or framework overlay. Protected planner URLs correctly returned `307 /login`; therefore authenticated Phase 5A/5B/5C UI and interaction acceptance remains part of the manual checklists below.

## Phase 5C authenticated manual checklist

This remains pending until a valid authenticated browser session with suitable Route A/B/C fixtures is available.

1. Open a trip with Route A, Route B, and Route C containing intentionally varied days, Cities, places, Hotels, transport items, and saved Day routes.
2. Enter Phase 5B Compare and open Decision summary.
3. Confirm the desktop panel and mobile/portrait Sheet match the accepted Phase 5C Stitch references.
4. Confirm Primary is the baseline and every non-primary delta says vs Primary.
5. Confirm City stage count includes every explicit occurrence while unique City places deduplicate shared place identity.
6. Confirm City sequence remains based on manual day/item order and collapses only adjacent occurrences of the same City; City stage count still includes every explicit occurrence.
7. Confirm City span is labeled City span · straight-line.
8. Confirm City span is never combined with Walk, Drive, Train, or other saved route-mode distances.
9. Confirm complete continuous dates produce the persisted day count and day count minus one nights.
10. Confirm Nights is omitted when unknown for every variant, but a variant-specific unknown reason remains visible when another variant has known nights.
11. Confirm unique planned places deduplicate shared persisted place IDs and exclude null place IDs.
12. Confirm a duplicated variant can show copied saved routes as uncalculated without creating zero-valued mode distances.
13. Confirm current successful saved Day route calculations contribute distance to their explicit Walk, Drive, Train, or other saved mode.
14. Change coordinates, stop order, or a leg mode and confirm the stale route is counted and excluded from totals.
15. Delete or clear a referenced route item and confirm needs editing is counted and excluded from totals.
16. Confirm aggregate Day-route distance and duration rows are absent; mode-distance rows use explicit saved leg modes only.
17. Confirm straight fallback distance remains known in its saved mode bucket without displaying an inferred duration.
18. Confirm Trip transport items and Saved Day route modes are separate and reflect explicit stored data only.
19. Expand Hotel occurrences and confirm same, changed, added, removed, and affected date/day details against Primary.
20. Confirm Hotel occurrences are not described or counted as inferred nights.
21. Confirm neutral delta chips and assistive labels do not imply a winner, loser, improvement, or recommendation.
22. Rename, recolor, and set a new Primary; confirm cached summary identity and baseline reconcile safely.
23. Add, edit, delete, copy, clear, and reorder relevant items; confirm summary data refreshes without changing the URL variant.
24. Save, calculate, and clear a Day route; confirm route status and per-mode distances refresh.
25. Inspect the network log while opening, retrying, refetching, and expanding summary details; confirm zero Google Routes and Place Details requests.
26. Confirm the active URL variant Matrix remains editable and inactive variants remain read only throughout summary use.
27. At 834×1194, 768×1024, 390×844, and 430×932, confirm the dedicated Summary Sheet, separate Routes Sheet, map return flow, detail expansion, and 44px targets.
28. Simulate loading and summary failure; confirm the Matrix/comparison remain usable and Retry is isolated to summary.
29. Verify the complete experience at 1440×900, 1280×800, 1024×768, 834×1194, 768×1024, 390×844, and 430×932.
30. Close summary and comparison; confirm the normal active planner, Overview, Day route save/calculate/clear, and variant lifecycle behavior remain unchanged.

## Phase 5B authenticated manual checklist

This remains pending until a valid authenticated browser session with suitable Route A/B/C fixtures is available.

1. Open a trip containing Route A, Route B, and Route C.
2. Confirm the normal active-variant Matrix, Overview, and map behavior.
3. Enter **Compare** at 1440×900, 1280×800, and 1024×768.
4. Confirm the overlay, controls, spacing, hierarchy, and panel behavior match the Phase 5B Stitch references.
5. Confirm all visible variants show only their explicitly entered City Overview stages.
6. Confirm each variant uses its stored color.
7. Confirm the active variant has the strongest line/marker treatment and highest stacking order.
8. Hide and restore an inactive variant using keyboard and pointer input.
9. Confirm the active variant's visibility control is checked and disabled.
10. Confirm every legend row includes variant name plus textual Primary and Editing/Read only state where applicable.
11. Confirm matching Cities across variants remain understandable through numbered markers and the named legend sequences.
12. Confirm a variant with no place-linked City stages remains listed as `No City stages`.
13. Confirm City-less days add no inferred locations or route stages.
14. Confirm inactive markers cannot select a Matrix cell, open an editor, or mutate/switch a variant.
15. Edit an active City title/place and confirm comparison refreshes without changing Matrix selection or URL variant.
16. Rename and recolor a variant and confirm the comparison identity updates.
17. Delete a non-primary inactive variant and confirm its visibility state is removed safely.
18. Inspect the network log and confirm entering, filtering, retrying, and refetching comparison make no Google Routes requests.
19. Exit comparison and confirm the normal active-variant Overview is restored.
20. Confirm any previous session-calculated Overview geometry is still available outside comparison.
21. Open a Day route draft and confirm Compare is disabled with the save/discard explanation; then use the established explicit discard behavior and retry.
22. At 834×1194, 768×1024, 390×844, and 430×932, enter comparison and confirm the expanded map opens with all visible variants overlaid.
23. Open **Routes**, hide and restore an inactive variant, and confirm the active variant remains checked and cannot be hidden.
24. Close the route controls and confirm the comparison map remains open with the selected visibility state.
25. Confirm the Matrix remains bound to and editable for the active URL variant.
26. Confirm `Matrix: Route A · Map: read only` and textual Editing/Read only identities are visible to assistive technology.
27. Close the expanded comparison map and confirm normal active Overview is restored.
28. Use browser Back and Forward to change the active URL variant, then repeat comparison and confirm editing/visibility identities reconcile.
29. Simulate or mock a comparison load failure and confirm the isolated error and Retry action.
30. Confirm Matrix editing remains available during comparison loading and failure.

## Phase 5A authenticated manual checklist

This remains pending until a valid authenticated browser session is available.

1. Open an existing trip and confirm Route A loads unchanged.
2. Create blank Route B.
3. Confirm Route B has the same day numbers/dates but no copied itinerary items or saved Day routes.
4. Add an item to Route B and confirm Route A is unchanged.
5. Duplicate Route A into Route C.
6. Confirm Route C has copied days, items, and item links, all with independent IDs.
7. Confirm copied items reuse the existing trip-level place IDs and no duplicate place rows were created.
8. Confirm a copied saved Day route retains stop order, duplicate first/final Hotel behavior, and every per-leg mode.
9. Confirm the copied route has no calculation snapshot, shows that calculation is required, and does not calculate automatically.
10. Edit Route C and confirm Route A stays unchanged.
11. Switch A/B/C using direct URLs, the selector, browser Back, and browser Forward.
12. Refresh on Route B and confirm Route B remains active.
13. Rename and recolor Route B; confirm its name remains visible beside color at every breakpoint.
14. Set Route B primary.
15. Remove the `variant` query and confirm Route B loads as the primary fallback.
16. Confirm old Route A no longer shows the textual **Primary** badge.
17. Confirm primary deletion is blocked.
18. Confirm final-variant deletion is blocked (use a separate one-variant fixture trip).
19. Delete a non-primary variant and confirm its days/items/links/plans/stops/legs/calculations are cleaned up.
20. Confirm shared places used by another variant remain intact after deletion.
21. Confirm no Google Routes request occurs during create, duplicate, switch, rename/color, set-primary, or delete.
22. Confirm Overview and explicit Day route calculation still work independently in each active variant, without pins, stages, lines, summaries, selections, or drafts leaking across variants.
23. Verify the authenticated planner at 1440×900, 1280×800, 1024×768, 834×1194, 768×1024, 390×844, and 430×932, including 44px mobile controls, the map peek/Sheet, the mobile variant Sheet, and one active editable variant only.
24. Open the desktop route selector over the Matrix and confirm its menu remains above the sticky table header while scrolling.
25. Set a different primary route and confirm the badge changes immediately, the success message appears, and a refresh/query-free URL keeps the new primary.
26. On Day 2 or later, add distinct place-linked Hotels to the previous and active day. Confirm the shortcut stays disabled until both exist, then places the previous-day Hotel first and today's Hotel last without allowing another stop before the start.
27. Select one occupied Matrix cell and then a multi-cell range; clear each using Backspace/Delete and the toolbar/menu action. Confirm the dialog reports the item count, cancellation preserves data, confirmation deletes all selected items atomically, and affected saved routes show **Needs editing**.
28. At 390×844 and 430×932, confirm the top bar shows the compact route identity without duplicating the trip title or **Primary** badge, while the variant Sheet still shows names and textual primary state.

## Phase 3–4 authenticated manual smoke test

This checklist remains pending until valid test-account access and the required deployed/local Google configuration are available.

1. Link places to City, Activity, Meal, Hotel, and Car rental items; refresh and confirm markers persist without per-marker Place Details calls.
2. Confirm exact matrix item ↔ Pin selection, including collocated items, mobile map peek, and expanded map selection preservation.
3. Confirm Overview contains one stage per City item, gives multiple same-day Cities the same first-date label, rejects neighboring duplicate City places only within one day, omits the no-travel boundary when a later day starts in the previous day's final City, and skips City-less days without inference.
4. Confirm Overview opens with a compact route summary and straight previews, derives its five-mode defaults from arrival-day Transport items or the 500 km threshold, and makes no Routes API request until the expanded **Calculate route** flow is confirmed. Set one connection to **Not set** and confirm it remains straight while configured connections calculate; confirm the expanded list shows every City pair, distance, and duration together with its transport selector.
5. Confirm a day with no saved Route A remains quiet. On a day with multiple Cities, confirm Day route defaults to blue City transfers plus eligible gray Day stops and that **All**, **City transfers**, and **Day stops** filter the layers independently.
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
19. Confirm there is no multi-variant map overlay, alternative chooser, schedule selector, time-order control, route preference, or waypoint optimization.
20. Log out and confirm protected routes redirect to login.

## Planned phases

1. ✅ Supabase, authentication, foundational schema, RLS, and trip CRUD
2. ✅ Core itinerary workspace, editing interactions, and responsive layouts
3. Google Maps and Places API (New) — implementation complete; authenticated smoke test pending
4. Primary Route A Overview and optional manual Day routes — implementation/database/automated checks complete; authenticated smoke test pending
5. Route variants
   - ✅ Phase 5A: active variant loading and lifecycle foundation
   - ✅ Phase 5B: read-only City Overview map comparison (authenticated acceptance pending)
   - ✅ Phase 5C: factual Route Variant decision summary (authenticated acceptance pending)
6. Public read-only sharing and export
7. Travel research and along-the-way city recommendations
8. Offline, conflict, deployment, and operational polish

Each phase is independently implemented and verified. Phase 5C adds persisted factual decision metrics without Google alternatives, automatic calculation, scores, recommendations, public sharing/export, or cross-variant editing.
