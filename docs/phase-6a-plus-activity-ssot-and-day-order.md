# Phase 6A+ Activity SSOT and Activity order

Phase 6A+ supersedes the earlier City-item Overview model while retaining its deployed rows for compatibility and audit. The canonical hierarchy is:

```text
ordered Route Variant Days
  -> ordered itinerary Activities
     -> selected Place snapshots

Activities + Activity order -> owner Matrix, public views, locality, Day Route candidates
Days + Day order             -> owner Matrix, public views, Overview stages
```

City/locality summaries, Overview stages and anchors are pure projections. They are not separately editable or persisted. Saved Day routes remain route configuration/calculation artifacts and never become itinerary content.

## Canonical order

- `trip_days.day_number` is the manual Day sequence for one Route Variant. Day IDs remain stable.
- `itinerary_items.sort_order` is the manual Activity sequence within a Day. Hotel is always final. Timed Activities are fixed UI anchors; untimed Activities are manually placed around them without time-based sorting.
- A time-bearing event has one optional UI time backed by `start_time`. The editor no longer reads or writes an end time. The nullable legacy `end_time` column is retained rather than destructively removed.
- `day_route_stops.position` is an explicit route-specific sequence. It does not mutate Activity order.
- Day reorder uses `reorder_variant_days(...)`, which validates the exact Day set, locks the rows and writes the sequence atomically. Complete position-derived date horizons are re-derived; incomplete/user-authored date sets stay attached to their stable Day IDs.

The owner does not expose a Day Arrange mode. Each Day exposes **Arrange Activities**, which contains Activity, Meal and the closing Hotel—not Transport or other movement/support records—and uses click-to-place gaps rather than drag. A sticky live status preserves the moving Activity identity during long scrolls. Placement happens only after pointer-up with less than 10px vertical movement and no intervening scroll. The same targets support Arrow-key/Home/End navigation and Enter/Space; Escape cancels and Undo invokes the same canonical mutation. A create form is not projected into the Matrix or map before its save succeeds. Creating an Activity or Meal then advances to the focused **Click to place** step, so order is not buried in an `after …` form field. A newly created timed item may be placed once and then becomes an anchor; untimed items remain movable. Hotel shows and keeps its fixed end-of-Day position.

## Place and locality

The existing Google Place selection fetches the selected Place details once, including typed address components. The deterministic resolver uses component types in this order:

1. `locality`
2. `postal_town`
3. `administrative_area_level_3`
4. country-aware `administrative_area_level_2` for supported East Asian city-equivalent address models
5. `sublocality_level_1`
6. `sublocality`

The selected snapshot may store `locality_name`, its component kind, country code, administrative area and provenance. It makes no locality Text Search request, does not create a global Cities table and does not resolve Places during render. Existing provider locality is never replaced by lower-quality legacy City data.

Google Maps/Places requests use the application's consistent English language setting. Locality strings are normalized only for trip-local comparison/deduplication; they are not treated as globally canonical identities.

The repository already durably persists non-ID Place snapshots. Phase 6A+ keeps the normalized locality inside that existing boundary and does not store raw address-component arrays or provider responses. Current Google Places policy exempts Place IDs from indefinite caching but subjects other Places content to the applicable caching/contract restrictions. Before deployment, the project owner must confirm that the existing snapshot retention is covered by the project's Google Maps Platform agreement or add the required retention/refresh policy; this phase does not invent a second store or silently claim a new exception.

## Derived locality and Overview

For one Day, locality evidence comes from canonical place-linked Activity, Meal and Hotel destinations in manual order. Transport, Flight, Train and Car rental are movement/support records and do not contribute destination/locality evidence. Repeated labels deduplicate by first appearance. Only when a Day has no Activity locality evidence may retained legacy `location` data supply a fallback.

Primary locality is the last overnight Stay locality when available, otherwise the dominant Activity locality, with the first manual occurrence winning a tie. Overview map stages additionally cluster all usable Activity localities per Day in first-appearance order, so intermediate major stops are not lost to the base-locality projection. Alternating visits do not create noisy repeated markers; when a final Hotel returns to the base after an intermediate cluster, that return is retained as the final stage. Adjacent same-locality Day boundaries collapse, while a non-adjacent return remains separate. Unresolved Days remain textual Overview stages.

A mappable stage anchor is a spherical medoid selected from actual Activity/Meal/Hotel coordinates in the stage. The result is always one real destination point and is safe around the antimeridian. Legacy City coordinates are used only when the stage has no usable Activity coordinates. Overview connections initially use straight dashed previews. Ordinary render and Overview open make no Routes request; owner and permitted public viewers can explicitly choose stage modes and calculate temporary route geometry.

The owner editing surface is Table-only. Its persistent whole-trip map derives from the same optimistic/draft workspace as Matrix and Day Route candidates, so an unsaved place edit is reflected immediately without introducing a second owner content editor. Cell and map scope are one synchronized focus model: clicking an already-selected cell's whitespace clears the cell and returns to Whole trip, while clicking an item keeps item/map focus behavior; explicitly choosing Whole trip also clears the cell and selected item. Public Overview/Table/Timeline read only the saved, server-redacted `get_public_itinerary_v2` projection; owner draft state cannot enter a public response.

Public Overview and Timeline present Activity, Meal and the closing Hotel as the destination sequence, using compact icons without repeated visible type or ordinal `Item 1` labels. Both read-only modes render Transport/Flight/Train together on one quiet, comma-separated, route-icon line. Car rental uses a second car-icon line whose entries begin with `Pickup:` or `Return:` and retain only useful time, provider, and location context. Repeated values are removed and long rows truncate instead of introducing pills or a nested horizontal scroller. Transport and rental never contribute to the Activity/destination-stop count. Activities may use additional vertical space for address, notes and safe quick-action links. Notes remain support content outside the destination rail. The public Table continues to express the same distinction through its separate Matrix columns.

## Day Route

Eligible Activity, Meal and Hotel Places are derived in canonical manual order. Time never changes that order and route calculation is never automatic. Existing saved route stop order remains explicit route configuration, including the supported same-Hotel start/end occurrence. Place/removal/route-config changes are detected by the existing signature/status model; notes, labels and links do not stale geometry. Calculate/Recalculate remains an explicit provider-cost boundary.

After an explicit calculation, owner and public route panels expose a compact, expandable leg list. Each leg shows origin/destination, duration, distance and a short explanation such as walking/driving/transit directions, current-service transit estimate or direct-line fallback. This is presentation of the returned/saved calculation only and makes no follow-up provider request.

Variant comparison inherits the map scope where it is entered. From Whole trip it compares Activity-derived Overview locality stages. From This day it locks to the selected canonical day number across variants and compares only that Day route: saved calculation geometry is reused when present, while missing/invalid geometry falls back to a dashed stop-order preview. Both are read only and make no provider request. Comparison stops use Google Maps native Pin elements with an explicit bottom-center geographic anchor; route names stay in the legend rather than changing the marker anchor box. The desktop route legend is collapsible without changing visibility filters; mobile route controls remain a dismissible Sheet. Whole-trip Decision summary is intentionally absent from the day-scoped comparison.

## Legacy compatibility and backfill

Migration `20260807190815_activity_ssot_locality_backfill_and_day_order.sql` adds optional locality fields, the v2 Place upsert and the atomic Day reorder RPC. Its deterministic backfill populates only unresolved Places referenced by legacy City items, records `legacy_city` provenance and preserves every Trip, Variant, Day, Activity, Place, route and relationship. It neither normalizes manual sort gaps nor creates duplicate Days/Activities.

Migration `20260807193302_activity_ssot_public_projection_v2.sql` adds a versioned public projection. V1 remains deployed for backward compatibility. V2 removes City items from public content, derives Day locality/primary locality from Activities and uses legacy City only where Activity evidence is incomplete. Legacy tables, item enum values and rows remain intact; new application writes cannot create/copy/delete/reorder legacy City rows.

Migration `20260808022426_enforce_hotel_last_activity_order.sql` densely reorders every existing Day while preserving row counts, IDs, Day relationships and relative non-Hotel order, then places the existing Hotel last. The atomic Activity reorder RPC rejects a non-final Hotel. No legacy City row or column is dropped.

Rollback-wrapped database coverage includes normal Activities and Places, legacy City-only locality, incomplete Activity locality, multiple Route Variants, gapped manual order, stable IDs/relationships, saved route references, Hotel-last backfill, atomic reorder rejection and before/after row counts. Destructive legacy cleanup is intentionally deferred.

## Failure and cost behavior

Missing locality or coordinates never blocks the itinerary. Text uses `Locality unavailable`; map anchors are omitted when unusable; provider failures leave textual Overview and route configuration usable. Copy, save, share, QR-generation and route-calculation waits retain their current content and show an accessible spinner/status instead of a blank control. Ordinary render, notes edits, Overview open, Day reorder and Activity edits make no Routes API request. Only explicit Day/Overview Calculate actions cross the existing provider-cost boundary. No new provider, key, city dataset or configuration is required.

## Visual references

The verified Phase 6A Desktop Matrix remains the owner visual baseline, while the verified public Overview and tablet Overview remain the public baseline documented in [phase-6a-stitch-canonical-states.md](./phase-6a-stitch-canonical-states.md). The named Day Order Reordering Explorer was unavailable through the repository/connected tooling during implementation, so no screen or project ID is asserted; the Activity click-to-place contract above is authoritative.
