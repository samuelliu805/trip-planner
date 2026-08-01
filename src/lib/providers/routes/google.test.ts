import assert from "node:assert/strict";
import test from "node:test";

import {
  GOOGLE_ROUTES_FIELD_MASK,
  RouteProviderError,
  createGoogleRoutesProvider,
  durationSeconds,
  googleRoutePayload,
} from "./google.ts";
import type { RouteTravelMode } from "./types.ts";

const waypoints = [
  { itemId: "one", latitude: 1, longitude: 2 },
  { itemId: "two", latitude: 3, longitude: 4 },
  { itemId: "three", latitude: 5, longitude: 6 },
];

test("Google payload preserves order, disables alternatives and optimization for every mode", () => {
  for (const travelMode of ["walk", "drive", "bicycle", "transit"] as RouteTravelMode[]) {
    const payload = googleRoutePayload({ travelMode, waypoints });
    assert.deepEqual(payload.origin.location.latLng, { latitude: 1, longitude: 2 });
    assert.deepEqual(payload.intermediates[0].location.latLng, { latitude: 3, longitude: 4 });
    assert.deepEqual(payload.destination.location.latLng, { latitude: 5, longitude: 6 });
    assert.equal(payload.computeAlternativeRoutes, false);
    assert.equal(payload.optimizeWaypointOrder, false);
  }
});

test("Google duration normalization rounds fractional seconds", () => {
  assert.equal(durationSeconds("123.6s"), 124);
});

test("Google provider uses a narrow mask and normalizes its response", async () => {
  let headers: HeadersInit | undefined;
  const provider = createGoogleRoutesProvider({
    apiKey: "test-only-secret",
    fetch: async (_url, init) => {
      headers = init?.headers;
      return new Response(
        JSON.stringify({
          routes: [{
            distanceMeters: 1200,
            duration: "600s",
            legs: [{ distanceMeters: 1200, duration: "600s" }],
            polyline: { encodedPolyline: "encoded" },
          }],
        }),
      );
    },
  });
  const result = await provider.calculate({ travelMode: "walk", waypoints: waypoints.slice(0, 2) });
  assert.equal(result.durationSeconds, 600);
  assert.equal(new Headers(headers).get("X-Goog-FieldMask"), GOOGLE_ROUTES_FIELD_MASK);
  assert.notEqual(GOOGLE_ROUTES_FIELD_MASK, "*");
});

test("Google provider maps quota and empty route responses", async () => {
  const quota = createGoogleRoutesProvider({ apiKey: "x", fetch: async () => new Response("", { status: 429 }) });
  await assert.rejects(() => quota.calculate({ travelMode: "walk", waypoints: waypoints.slice(0, 2) }), (error) => error instanceof RouteProviderError && error.code === "quota");
  const empty = createGoogleRoutesProvider({ apiKey: "x", fetch: async () => new Response("{}") });
  await assert.rejects(() => empty.calculate({ travelMode: "walk", waypoints: waypoints.slice(0, 2) }), (error) => error instanceof RouteProviderError && error.code === "no_route");
});
