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

`places.source` identifies `google`, `amap`, or `custom`; `provider_place_id` is the canonical
provider-neutral identifier. Existing Google rows retain `google_place_id`, which is backfilled to
the canonical column and remains readable by the compatibility mapping and RPC. The v3 place RPC
requires a provider ID, display name, optional formatted address, and explicit WGS-84 coordinates
for both Google and AMap. It rejects any snapshot labelled GCJ-02 instead of guessing or converting
inside shared/database code.

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
click/keyboard selection. The provider-local Places client owns one abortable search session at a
time and calls only the same-origin `/api/maps/amap/places` endpoint. A new query invalidates every
prior opaque suggestion ID, including after an empty or failed response, and stale responses never
reach shared UI code.

## AMap secrets and fixed upstreams

- `NEXT_PUBLIC_AMAP_JS_API_KEY` is the browser-visible JS API key.
- `AMAP_JS_SECURITY_CODE` is server-only and exists only at the same-origin `/_AMapService` proxy.
- `AMAP_WEB_SERVICE_KEY` is server-only and exists only in the AMap route and Places server
  adapters.

The browser sets `window._AMapSecurityConfig.serviceHost` to the current origin's
`/_AMapService`. The proxy accepts only GET requests to the exact AMap input-tip, POI, and map-style
paths required by the adapter. It constructs one of two fixed upstream origins, rejects
host/URL/target inputs, appends `jscode` server-side, follows no redirects, enforces a timeout and a
2 MiB response limit, and never logs or returns the security code.

AMap Places autocomplete and POI resolution use a separate provider-local, same-origin GET
endpoint. That endpoint constructs only the fixed `restapi.amap.com` input-tip and POI-detail URLs,
accepts a bounded allowlist of query fields, appends `AMAP_WEB_SERVICE_KEY` only on the server,
follows no redirects, and enforces an 8-second/512 KiB response bound. It returns only suggestion
labels or a normalized `PlaceSnapshot`; the raw AMap response, GCJ-02 location, and Web Service key
are never returned to browser code.

AMap route calculation calls fixed `restapi.amap.com` walking, driving, or bicycling endpoints from
the server. Walk maps to walking; self-driving, rideshare, and taxi map to driving; bike maps to
bicycling. Modes requiring unsupported city/service context use the existing explicit straight-line
fallback and never make an upstream request. Provider errors and timeouts are normalized without
including keys or upstream response bodies.

Both server-only names must be present in the CloudBase Run runtime itself. CI job environment
variables are not runtime configuration. The CN deployment gate reads Run detail before deployment,
validates only the two variable names, preserves the service's existing runtime environment during
the pinned source deployment, and repeats the name-only check after release. Missing names fail
before mutation; their values are never emitted by the validator.

## Capability boundary

Global keeps Google maps, Places, Routes, and Google public Place Photos. CN uses AMap maps, Places,
and Routes without Google requests. AMap public Place Photos are not implemented: the existing
photo facade stays fail closed unless both the deployment and saved source are Google.
