import assert from "node:assert/strict";
import test from "node:test";

import { compiledServerActionId } from "./lib/compiled-server-action.mjs";

test("Next 16.4 action-level export names resolve the compiled action ID", () => {
  const manifest = {
    node: {
      settingsId: {
        exportedName: "saveTripSettings",
        filename: "src/features/trips/settings-actions.ts",
        workers: { "app/trips/[tripId]/page": { moduleId: 319789, async: false } },
      },
      deleteId: {
        exportedName: "runTripBackgroundAction",
        workers: { "app/trips/page": { moduleId: 843414, async: false } },
      },
    },
  };
  assert.equal(compiledServerActionId(manifest, "saveTripSettings"), "settingsId");
  assert.equal(compiledServerActionId(manifest, "runTripBackgroundAction"), "deleteId");
});

test("legacy worker-level export names still resolve one ID across several routes", () => {
  assert.equal(
    compiledServerActionId(
      {
        node: {
          settingsId: {
            workers: {
              "app/trips/page": { exportedName: "saveTripSettings" },
              "app/trips/[tripId]/page": { exportedName: "saveTripSettings" },
            },
          },
        },
      },
      "saveTripSettings",
    ),
    "settingsId",
  );
});

test("missing and ambiguous exports fail instead of skipping authorization probes", () => {
  for (const manifest of [
    { node: {} },
    {
      node: {
        a: { exportedName: "saveTripSettings" },
        b: { workers: { page: { exportedName: "saveTripSettings" } } },
      },
    },
  ]) {
    assert.throws(
      () => compiledServerActionId(manifest, "saveTripSettings"),
      /must resolve in the exact compiled application/,
    );
  }
});
