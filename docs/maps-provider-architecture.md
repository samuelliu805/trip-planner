# Maps provider architecture

## Selection and contracts

`NEXT_PUBLIC_MAPS_PROVIDER` is the single provider-selection input for browser and server workflows. The bounded IDs are `google` and `amap`. A missing value resolves to `google` only in the explicit development/test compatibility path, preserving the current local Global behavior; Preview and Production builds validate the complete deployment matrix and require it explicitly. An invalid value raises a typed configuration error. `amap` is reserved but unavailable in this phase, so maps, Places, and Routes fail closed instead of falling back to Google.

Provider-neutral contracts and resolvers live under:

- `src/lib/providers/maps`: provider IDs, WGS-84 coordinates, renderer contracts, and client entry points.
- `src/lib/providers/places`: suggestion/session/resolution contracts, normalized failures, snapshots, and photo facade.
- `src/lib/providers/routes`: route requests/results, geometry compatibility, errors, and the server resolver.

Google adapters live only under `src/lib/providers/google`. Production imports of `@vis.gl/react-google-maps` and references to `google.maps.*` are forbidden elsewhere by `npm run check:maps-provider-boundary`. Feature components consume serializable provider-neutral DTOs; Google predictions, session tokens, browser map instances, keys, field masks, and provider modes stay inside the adapter.

## Coordinates and compatibility

Canonical persisted coordinates are WGS-84. Normalized `Coordinates`, `PlaceSnapshot`, and route geometry carry `coordinateSystem: "wgs84"`. Readers accept legacy place and straight-route JSON without the field and normalize it in memory; no records are rewritten and no database migration is required. Legacy `{ source: "google", encodedPolyline }` geometry also normalizes to the provider-neutral encoded geometry contract.

WGS-84 ↔ GCJ-02 conversion belongs exclusively in the future AMap adapter. Generic feature, persistence, sharing, and route code must never convert coordinates.

## Runtime boundaries

Google Maps and Places browser modules are Client Components and load through one `APIProvider`, retaining locale, Places library, Map ID, loading, marker, polyline, fit-bounds, and selection behavior. Google Routes and Place Photo key access are server-only. Server Components pass only plain serializable map, place, and route models into client components.

Public maps use the same renderer entry point as authenticated maps. Public Place Photos are explicitly gated to a matching global `google` provider and Google source; another configured provider never invokes Google photo APIs. Signed proxy validation, no-store caching, attribution, and source URL behavior remain in the Google photo adapter.

## Next AMap PR acceptance gates

The follow-up may add the AMap loader, renderer, Places, Routes, and adapter-local WGS-84/GCJ-02 conversion. It must keep the same generic contracts, add no provider UI unless separately approved, preserve server/client selection consistency, keep secrets server-only, add adapter cleanup and stale-request tests, extend the static boundary guard if needed, and verify authenticated/public maps plus route and photo behavior without routing CN or AMap requests through Google.
