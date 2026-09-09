import assert from "node:assert/strict";
import test from "node:test";

import {
  dockState,
  effectiveDockProgress,
  fragmentTransform,
  scrollProgress,
  targetContentOpacity,
  type FragmentTransform,
} from "./route-dock-math.ts";

test("scroll progress uses the actual scrollable hero range", () => {
  assert.equal(scrollProgress(200, 200, 3900, 1000), 0);
  assert.equal(scrollProgress(1650, 200, 3900, 1000), 0.5);
  assert.equal(scrollProgress(3100, 200, 3900, 1000), 1);
  assert.equal(scrollProgress(5000, 200, 3900, 1000), 1);
});

test("dock states follow the specified transition boundaries", () => {
  assert.equal(dockState(0), "scattered");
  assert.equal(dockState(0.14), "routing");
  assert.equal(dockState(0.5), "docking");
  assert.equal(dockState(0.75), "assembled");
});

test("every fragment reaches its measured target before crossfade", () => {
  const start: FragmentTransform = {
    borderRadius: 16,
    height: 80,
    opacity: 1,
    rotation: -4,
    scale: 1,
    width: 220,
    x: 900,
    y: 180,
  };
  const target = { height: 62, width: 188, x: 612, y: 544 };
  for (const kind of ["route", "stay", "activity", "document"] as const) {
    const result = fragmentTransform(kind, 0.72, start, target);
    assert.ok(Math.abs(result.x - target.x) < 0.001);
    assert.ok(Math.abs(result.y - target.y) < 0.001);
    assert.ok(Math.abs(result.width - target.width) < 0.001);
    assert.ok(Math.abs(result.height - target.height) < 0.001);
    assert.equal(result.opacity, 1);
  }
  assert.ok(fragmentTransform("route", 0.68, start, target).scale > 1);
  assert.equal(targetContentOpacity(0.72), 0);
  assert.equal(targetContentOpacity(0.75), 1);
});

test("reduced motion and WebGL failure select the static assembled state", () => {
  assert.equal(effectiveDockProgress(0, true, false), 1);
  assert.equal(effectiveDockProgress(0.25, false, true), 1);
  assert.equal(effectiveDockProgress(0.25, false, false), 0.25);
});
