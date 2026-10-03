import assert from "node:assert/strict";
import test from "node:test";

import { wgs84Coordinates } from "../../lib/providers/maps/types.ts";
import { createAmapRoutesProvider } from "../../lib/providers/amap/routes/amap-routes-core.ts";
import { createGoogleRoutesProvider } from "../../lib/providers/google/routes/google-routes-core.ts";
import { selectableRouteLegModes } from "../routes/types.ts";
import { publicRouteCalculationInputSchema } from "./public-route-schema.ts";

const input = {
  dayRef: "1".repeat(64),
  stopRefs: ["2".repeat(64), "3".repeat(64)],
  token: "00000000-0000-4000-8000-000000000001",
};

test("shared day calculations accept every selectable mode and reject malformed requests", () => {
  for (const mode of selectableRouteLegModes)
    assert.equal(
      publicRouteCalculationInputSchema.safeParse({ ...input, legModes: [mode] }).success,
      true,
      mode,
    );
  for (const legModes of [["unknown"], [], ["flight", "ferry"], ["rideshare"]])
    assert.equal(
      publicRouteCalculationInputSchema.safeParse({ ...input, legModes }).success,
      false,
    );
  assert.equal(
    publicRouteCalculationInputSchema.safeParse({
      ...input,
      legModes: ["flight"],
      stopRefs: [input.stopRefs[0], input.stopRefs[0]],
    }).success,
    false,
  );
});

for (const createProvider of [createAmapRoutesProvider, createGoogleRoutesProvider]) {
  test(createProvider.name + " uses straight legs without directions requests", async () => {
    let requests = 0;
    const provider = createProvider({
      apiKey: "unused",
      fetchImplementation: async () => {
        requests++;
        throw new Error("Straight legs must not request directions.");
      },
    });
    for (const mode of ["flight", "ferry", "cable_car", "motorcycle", "other"] as const) {
      const leg = await provider.calculateLeg({
        destination: wgs84Coordinates(35.68, 139.69),
        legSignature: "test-" + mode,
        mode,
        origin: wgs84Coordinates(48.85, 2.35),
        position: 1,
      });
      assert.equal(leg.mode, mode);
      assert.equal(leg.geometry.source, "straight");
      assert.equal(leg.durationSeconds, null);
      assert.ok(leg.distanceMeters > 0);
    }
    assert.equal(requests, 0);
  });
}
