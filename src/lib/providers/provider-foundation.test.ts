import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { placeSnapshotSchema } from "../../features/itinerary/item-schema.ts";
import { createGooglePlacesProvider } from "./google/places/google-places-provider.ts";
import {
  MapsProviderConfigurationError,
  configuredMapsProviderId,
  parseMapsProviderId,
  resolveMapsProvider,
  type MapsProviderCapability,
} from "./maps/provider.ts";
import { coordinatesFromJson } from "./maps/types.ts";
import { PlaceProviderError } from "./places/errors.ts";
import { publicPhotoProviderEnabled } from "./places/photo-gating.ts";
import { placeSnapshotFromJson } from "./places/types.ts";
import { routeGeometryFromJson } from "./routes/geometry.ts";
import { serializeRoutesV1CalculatedLegs } from "./routes/persistence.ts";
import { findMapsProviderBoundaryViolations } from "../../../scripts/check-maps-provider-boundary.ts";

test("maps provider resolution defaults every capability to Google", () => {
  assert.equal(configuredMapsProviderId(undefined), "google");
  assert.equal(configuredMapsProviderId(""), "google");
  assert.equal(configuredMapsProviderId(" GOOGLE "), "google");
  for (const capability of ["maps", "places", "routes", "photos"] as const)
    assert.equal(resolveMapsProvider(capability, undefined), "google");
});

test("AMap is a bounded ID but every unimplemented capability fails closed", () => {
  assert.equal(parseMapsProviderId("amap"), "amap");
  assert.equal(configuredMapsProviderId("amap"), "amap");
  for (const capability of ["maps", "places", "routes", "photos"] as MapsProviderCapability[])
    assert.throws(
      () => resolveMapsProvider(capability, "amap"),
      (error) =>
        error instanceof MapsProviderConfigurationError &&
        error.code === "provider_unavailable" &&
        error.providerId === "amap" &&
        error.capability === capability,
    );
  assert.equal(parseMapsProviderId("unknown"), null);
  assert.throws(
    () => configuredMapsProviderId("unknown"),
    (error) => error instanceof MapsProviderConfigurationError && error.code === "invalid_provider",
  );
});

test("client and server provider entry points use the same resolver", async () => {
  const [mapClient, placesClient, routeServer] = await Promise.all(
    [
      "./maps/planner-map-provider.tsx",
      "./places/resolver.client.ts",
      "./routes/resolver.server.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of [mapClient, placesClient, routeServer])
    assert.match(source, /resolveMapsProvider/);
  assert.doesNotMatch(routeServer, /calculateGoogleRouteLeg/);
});

test("production Google SDK references stay inside the Google provider boundary", async () => {
  assert.deepEqual(await findMapsProviderBoundaryViolations(), []);
});

test("place snapshots accept legacy Google, custom, and reserved AMap values safely", () => {
  const legacyGoogle = placeSnapshotFromJson({
    displayName: "Temple",
    latitude: 35.01,
    longitude: 135.77,
    provider: "google",
    providerPlaceId: "google-temple",
  });
  assert.equal(legacyGoogle?.coordinateSystem, "wgs84");
  assert.equal(
    placeSnapshotFromJson({
      displayName: "Custom stop",
      latitude: 35,
      longitude: 135,
      provider: "custom",
    })?.provider,
    "custom",
  );
  assert.equal(
    placeSnapshotFromJson({
      displayName: "Future AMap stop",
      latitude: 31.2,
      longitude: 121.5,
      provider: "amap",
      providerPlaceId: "future-amap-id",
    })?.provider,
    "amap",
  );
  assert.equal(
    placeSnapshotFromJson({
      displayName: "Unknown",
      latitude: 0,
      longitude: 0,
      provider: "other",
    }),
    null,
  );
});

test("legacy coordinates normalize to explicit WGS-84 and reject unknown systems", () => {
  assert.deepEqual(coordinatesFromJson({ latitude: 1, longitude: 2 }), {
    coordinateSystem: "wgs84",
    latitude: 1,
    longitude: 2,
  });
  assert.equal(coordinatesFromJson({ coordinateSystem: "gcj02", latitude: 1, longitude: 2 }), null);
  const parsed = placeSnapshotSchema.safeParse({
    displayName: "Legacy",
    latitude: 1,
    longitude: 2,
    provider: "google",
    providerPlaceId: "legacy-id",
  });
  assert.equal(parsed.success && parsed.data.coordinateSystem, "wgs84");
  assert.equal(
    placeSnapshotSchema.safeParse({
      coordinateSystem: "gcj02",
      displayName: "Invalid",
      latitude: 1,
      longitude: 2,
      provider: "google",
      providerPlaceId: "invalid-id",
    }).success,
    false,
  );
});

test("legacy Google and straight route geometry normalize without inventing AMap output", () => {
  assert.deepEqual(routeGeometryFromJson({ encodedPolyline: "encoded", source: "google" }), {
    coordinateSystem: "wgs84",
    encodedPolyline: "encoded",
    encoding: "polyline5",
    provider: "google",
    source: "encoded",
  });
  assert.deepEqual(
    routeGeometryFromJson({
      destination: { latitude: 2, longitude: 2 },
      origin: { latitude: 1, longitude: 1 },
      source: "straight",
    }),
    {
      coordinateSystem: "wgs84",
      destination: { coordinateSystem: "wgs84", latitude: 2, longitude: 2 },
      origin: { coordinateSystem: "wgs84", latitude: 1, longitude: 1 },
      source: "straight",
    },
  );
  assert.equal(routeGeometryFromJson({ provider: "amap", source: "amap" }), null);
});

test("routes-v1 persistence keeps the deployed Google and straight geometry shapes", () => {
  const common = {
    computedAt: "2026-08-29T00:00:00.000Z",
    distanceMeters: 100,
    durationSeconds: 60,
    legSignature: "leg-signature",
    mode: "walk" as const,
    position: 1,
    providerMode: "WALK",
    warnings: [],
  };
  const serialized = serializeRoutesV1CalculatedLegs([
    {
      ...common,
      geometry: {
        coordinateSystem: "wgs84",
        encodedPolyline: "encoded",
        encoding: "polyline5",
        provider: "google",
        source: "encoded",
      },
    },
    {
      ...common,
      position: 2,
      geometry: {
        coordinateSystem: "wgs84",
        destination: { coordinateSystem: "wgs84", latitude: 2, longitude: 2 },
        origin: { coordinateSystem: "wgs84", latitude: 1, longitude: 1 },
        source: "straight",
      },
    },
  ]);
  assert.deepEqual(
    serialized.map(({ geometry }) => geometry),
    [
      { encodedPolyline: "encoded", source: "google" },
      {
        destination: { latitude: 2, longitude: 2 },
        origin: { latitude: 1, longitude: 1 },
        source: "straight",
      },
    ],
  );
  assert.equal(routeGeometryFromJson(serialized[0].geometry)?.source, "encoded");
  assert.equal(routeGeometryFromJson(serialized[1].geometry)?.source, "straight");
});

test("Google Places adapter exposes DTOs, one session token, and normalized WGS-84 places", async () => {
  let tokenCount = 0;
  let fetchFieldsCount = 0;
  const prediction = {
    mainText: { text: "Temple" },
    placeId: "google-temple",
    secondaryText: { text: "Kyoto" },
    text: { text: "Temple, Kyoto" },
    toPlace: () => ({
      addressComponents: [],
      displayName: "Temple",
      fetchFields: async () => {
        fetchFieldsCount += 1;
      },
      formattedAddress: "Kyoto",
      id: "google-temple",
      location: { lat: () => 35.01, lng: () => 135.77 },
    }),
  };
  const places = {
    AutocompleteSessionToken: class {
      constructor() {
        tokenCount += 1;
      }
    },
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions: async () => ({
        suggestions: [{ placePrediction: prediction }],
      }),
    },
  } as never;
  const session = createGooglePlacesProvider(places).createSession();
  const first = await session.fetchSuggestions({ input: "Tem" });
  const second = await session.fetchSuggestions({ input: "Temple" });
  assert.deepEqual(first, second);
  assert.deepEqual(first, [{ id: "google-temple", primary: "Temple", secondary: "Kyoto" }]);
  assert.equal("prediction" in first[0], false);
  assert.equal(tokenCount, 1);
  const place = await session.resolveSuggestion(first[0].id);
  assert.equal(place.coordinateSystem, "wgs84");
  assert.equal(fetchFieldsCount, 1);

  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    createGooglePlacesProvider(places)
      .createSession()
      .fetchSuggestions({ input: "cancelled", signal: aborted.signal }),
    (error) => error instanceof PlaceProviderError && error.code === "cancelled",
  );
});

test("public Google photos are gated by both global and source provider", () => {
  assert.equal(publicPhotoProviderEnabled("google", "google"), true);
  assert.equal(publicPhotoProviderEnabled("amap", "google"), false);
  assert.equal(publicPhotoProviderEnabled("google", "amap"), false);
});

test("route actions use the resolver and provider work adds no telemetry identifiers", async () => {
  const [routes, sharing, routeTelemetry, sharingTelemetry] = await Promise.all(
    [
      "../../features/routes/actions.ts",
      "../../features/sharing/actions.ts",
      "../../features/routes/telemetry.server.ts",
      "../../features/sharing/telemetry.server.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const actions of [routes, sharing]) {
    assert.match(actions, /calculateRouteLeg/);
    assert.doesNotMatch(actions, /calculateGoogleRouteLeg/);
  }
  assert.match(routes, /serializeRoutesV1CalculatedLegs/);
  assert.doesNotMatch(
    routeTelemetry + sharingTelemetry,
    /providerPlaceId|googlePlaceId|google_place_id|shared_token|GOOGLE_(?:PLACES|ROUTES)_API_KEY/,
  );
});
