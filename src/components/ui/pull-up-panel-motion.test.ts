import assert from "node:assert/strict";
import test from "node:test";

import { settlePullUpPanel } from "./pull-up-panel-motion.ts";

test("a sheet returns from a slow partial drag and closes after a quick flick", () => {
  assert.equal(settlePullUpPanel({ distance: 90, height: 700, velocity: 0.1 }).close, false);
  assert.equal(settlePullUpPanel({ distance: 90, height: 700, velocity: 1.2 }).close, true);
  assert.equal(settlePullUpPanel({ distance: 300, height: 700, velocity: -0.1 }).close, true);
  assert.equal(
    settlePullUpPanel({ distance: 300, height: 700, velocity: 1.2, forceSnapBack: true }).close,
    false,
  );
});

test("settle duration stays bounded for short and long gestures", () => {
  for (const distance of [10, 100, 300, 650]) {
    const { duration } = settlePullUpPanel({ distance, height: 700, velocity: 0.2 });
    assert.ok(duration >= 180 && duration <= 380);
  }
});
