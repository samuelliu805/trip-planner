# Maps provider architecture

## Selection and contracts

`NEXT_PUBLIC_MAPS_PROVIDER` is the single deployment-time selector for browser and server map
workflows. The bounded IDs are `google` and `amap`. A missing value defaults to `google` only in the
development/test compatibility path; Preview and Production require the complete legal provider
matrix. Invalid values fail with a typed configuration error and never select a provider from a
request hostname, cookie, token, or query string.

Provider-neutral contracts and resolvers live under:

- `src/lib/providers/maps`: provider IDs, WGS-84 coordinates, renderer contracts, and client entry
  points;
- `src/lib/providers/places`: suggestion/session/resolution contracts, normalized failures, and
  snapshots;
- `src/lib/providers/routes`: route requests/results, geometry compatibility, normalized failures,
  and the server resolver.

Google adapters live only under `src/lib/providers/google`; AMap adapters live only under
`src/lib/providers/amap`. `npm run check:maps-provider-boundary` rejects Google SDK types/imports
outside the Google adapter and AMap SDK packages/globals outside the AMap adapter. Feature, domain,
database, and public-sharing code consumes only serializable provider-neutral DTOs.

## Coordinates and persistence

Canonical persisted coordinates are always WGS-84. `Coordinates`, `PlaceSnapshot`, and encoded
route geometry carry `coordinateSystem: "wgs84"`. Legacy places, straight legs, and
`{ source: "google", encodedPolyline }` geometry remain readable without rewriting records.

AMap receives and returns GCJ-02 inside China. Its adapter converts WGS-84 to GCJ-02 immediately
before map, Places, or Web Service calls and converts results back to WGS-84 before returning a
shared contract. No shared feature, persistence, UI, or database module performs that conversion.
Google route geometry retains its deployed legacy persistence shape; AMap route geometry persists
the provider-neutral encoded-polyline shape with WGS-84 points.

## Browser runtimes

Google Maps and Places retain the existing `APIProvider`, locale, Map ID, marker, polyline,
fit-bounds, selection, and cleanup behavior.

AMap uses JS API 2.0 with one reference-counted loader. A Strict Mode release/remount reuses the
pending script; cancelled or failed pending loads remove their script/listeners and restore the
previous security global. Authenticated and public pages use the same AMap canvas implementation.
The canvas owns map destruction, marker/polyline removal, fit view, selected-marker panning, and
click/keyboard selection. Places owns one `AutoComplete`/`PlaceSearch` session at a time and rejects
aborted or stale callbacks before normalized data reaches the UI.

## AMap secrets and fixed upstreams

- `NEXT_PUBLIC_AMAP_JS_API_KEY` is the browser-visible JS API key.
- `AMAP_JS_SECURITY_CODE` is server-only and exists only at the same-origin `/_AMapService` proxy.
- `AMAP_WEB_SERVICE_KEY` is server-only and exists only in the route adapter.

The browser sets `window._AMapSecurityConfig.serviceHost` to the current origin's
`/_AMapService`. The proxy accepts only GET requests to the exact AMap input-tip, POI, and map-style
paths required by the adapter. It constructs one of two fixed upstream origins, rejects
host/URL/target inputs, appends `jscode` server-side, follows no redirects, enforces a timeout and a
2 MiB response limit, and never logs or returns the security code.

AMap route calculation calls fixed `restapi.amap.com` walking, driving, or bicycling endpoints from
the server. Walk maps to walking; self-driving, rideshare, and taxi map to driving; bike maps to
bicycling. Modes requiring unsupported city/service context use the existing explicit straight-line
fallback and never make an upstream request. Provider errors and timeouts are normalized without
including keys or upstream response bodies.

## Capability boundary

Global keeps Google maps, Places, Routes, and Google public Place Photos. CN uses AMap maps, Places,
and Routes without Google requests. AMap public Place Photos are not implemented: the existing
photo facade stays fail closed unless both the deployment and saved source are Google.
