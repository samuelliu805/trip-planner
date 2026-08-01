import assert from "node:assert/strict";
import test from "node:test";

import { calculateWithCache } from "./calculation.ts";
import { waypointSignature } from "./signature.ts";

const request = {
  travelMode: "walk" as const,
  waypoints: [
    { itemId: "a", latitude: 1.23456789, longitude: 2 },
    { itemId: "b", latitude: 3, longitude: 4 },
  ],
};

test("waypoint signatures are stable and sensitive to order", () => {
  const input = { dayId: "day", variantId: "variant", ...request };
  assert.equal(waypointSignature(input), waypointSignature(input));
  assert.notEqual(
    waypointSignature(input),
    waypointSignature({ ...input, waypoints: [...input.waypoints].reverse() }),
  );
});

test("cache hit avoids the provider and cache miss calls it once", async () => {
  let calls = 0;
  const result = { distanceMeters: 1, durationSeconds: 2, encodedPolyline: "x", legs: [] };
  const provider = {
    calculate: async () => {
      calls += 1;
      return result;
    },
  };
  await calculateWithCache({
    cached: { ...result, waypointSignature: "same" },
    provider,
    request,
    signature: "same",
  });
  assert.equal(calls, 0);
  await calculateWithCache({ cached: null, provider, request, signature: "new" });
  assert.equal(calls, 1);
});

test("failed recalculation leaves the supplied previous cache unchanged", async () => {
  const cached = {
    distanceMeters: 1,
    durationSeconds: 2,
    encodedPolyline: "old",
    legs: [],
    waypointSignature: "old",
  };
  await assert.rejects(() =>
    calculateWithCache({
      cached,
      provider: {
        calculate: async () => {
          throw new Error("failed");
        },
      },
      request,
      signature: "new",
    }),
  );
  assert.equal(cached.encodedPolyline, "old");
});
