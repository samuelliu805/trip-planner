import assert from "node:assert/strict";
import test from "node:test";

import { calculateRouteConfiguration } from "../../../features/routes/calculator.ts";
import type {
  DayRouteCalculation,
  RouteCalculationConfig,
} from "../../../features/routes/types.ts";
import { RouteProviderError } from "../routes/errors.ts";
import type { RouteLegRequest } from "../routes/types.ts";
import { createGoogleRoutesProvider } from "./routes/google-routes-core.ts";

const airport = { coordinateSystem: "wgs84" as const, latitude: 43.4, longitude: 5.2 };
const now = () => "2026-10-03T00:00:00.000Z";
const request: RouteLegRequest = {
  destination: { ...airport },
  legSignature: "airport-to-car-rental",
  mode: "self_driving",
  origin: airport,
  position: 3,
};

test("co-located Google stops retain their order as a zero-distance leg without fetching", async () => {
  let calls = 0;
  const provider = createGoogleRoutesProvider({
    apiKey: "test-key",
    fetchImplementation: async () => {
      calls += 1;
      return Response.json({ routes: [{ duration: "0s" }] });
    },
    now,
  });
  for (const mode of ["self_driving", "taxi", "walk", "bike", "train"] as const) {
    const leg = await provider.calculateLeg({ ...request, mode });
    assert.equal(leg.distanceMeters, 0);
    assert.equal(leg.durationSeconds, 0);
    assert.equal(leg.position, request.position);
    assert.equal(leg.legSignature, request.legSignature);
    assert.equal(leg.mode, mode);
    assert.equal(leg.computedAt, now());
    assert.equal(leg.fallbackReason, undefined);
    assert.deepEqual(leg.geometry, {
      coordinateSystem: "wgs84",
      destination: request.destination,
      origin: request.origin,
      source: "straight",
    });
  }
  assert.equal(calls, 0);
});

test("reordering and relocating a stop to the airport recalculates and caches the full day", async () => {
  let calls = 0;
  const provider = createGoogleRoutesProvider({
    apiKey: "test-key",
    fetchImplementation: async () => {
      calls += 1;
      return Response.json({
        routes: [{
          distanceMeters: 1000,
          duration: "60s",
          polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq" },
        }],
      });
    },
    now,
  });
  const hotel = {
    itemId: "hotel",
    coordinates: { ...airport, latitude: 43.3 },
  };
  const meal = {
    itemId: "meal",
    coordinates: { ...airport, latitude: 43.5 },
  };
  const arrival = { itemId: "arrival", coordinates: airport };
  const rental = {
    itemId: "rental",
    coordinates: { ...airport, latitude: 43.45 },
  };
  const original: RouteCalculationConfig = {
    dayId: "day",
    legModes: ["self_driving", "self_driving", "self_driving"],
    stops: [hotel, arrival, meal, rental],
    tripId: "trip",
    variantId: "variant",
  };
  const first = await calculateRouteConfiguration(original, null, () => provider);
  assert.equal(calls, 3);
  const previous: DayRouteCalculation = {
    calculatedLegs: first.legs,
    computed_at: now(),
    config_signature: first.configSignature,
    plan_id: "plan",
    provider_schema_version: "routes-v1",
    total_distance_meters: first.totalDistanceMeters,
    total_duration_seconds: first.totalDurationSeconds,
    version: 1,
  };
  const saved = JSON.stringify(previous);
  const updated = {
    ...original,
    stops: [hotel, meal, arrival, { ...rental, coordinates: { ...airport } }],
  };
  const second = await calculateRouteConfiguration(updated, previous, () => provider);
  assert.notEqual(second.configSignature, first.configSignature);
  assert.equal(second.legs.length, 3);
  assert.deepEqual(second.legs.map((leg) => leg.position), [1, 2, 3]);
  assert.equal(second.legs[2].distanceMeters, 0);
  assert.equal(second.legs[2].durationSeconds, 0);
  assert.equal(second.totalDistanceMeters, 2000);
  assert.equal(second.totalDurationSeconds, 120);
  assert.equal(calls, 5);
  assert.equal(JSON.stringify(previous), saved);
  const cached = await calculateRouteConfiguration(updated, {
    ...previous,
    calculatedLegs: second.legs,
    config_signature: second.configSignature,
  }, () => provider);
  assert.equal(cached.cache, "full");
  assert.equal(calls, 5);
});

test("distinct Google stops still reject malformed responses and require a configured key", async () => {
  const distinct = {
    ...request,
    destination: { ...airport, latitude: airport.latitude + 0.00001 },
  };
  for (const route of [
    { duration: "0s" },
    { distanceMeters: 10, duration: "1s", polyline: {} },
    { distanceMeters: 10, duration: "invalid", polyline: { encodedPolyline: "abc" } },
  ]) {
    const provider = createGoogleRoutesProvider({
      apiKey: "test-key",
      fetchImplementation: async () => Response.json({ routes: [route] }),
    });
    await assert.rejects(provider.calculateLeg(distinct), (error) =>
      error instanceof RouteProviderError && error.code === "invalid_response");
  }
  await assert.rejects(
    createGoogleRoutesProvider({ apiKey: "" }).calculateLeg(request),
    (error) => error instanceof RouteProviderError && error.code === "missing_key",
  );
});
