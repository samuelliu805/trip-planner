import assert from "node:assert/strict";
import test from "node:test";

import { translateMessage } from "../i18n/translate.ts";

import {
  dockState,
  effectiveDockProgress,
  fragmentTransform,
  mobileWorkspaceLayout,
  scrollProgress,
  shouldResetLandingScroll,
  targetContentOpacity,
  type FragmentTransform,
} from "./route-dock-math.ts";
import { alternateLandingSite } from "./regional-landing-sites.ts";

test("scroll progress uses the actual scrollable hero range", () => {
  assert.equal(scrollProgress(200, 200, 3900, 1000), 0);
  assert.equal(scrollProgress(1650, 200, 3900, 1000), 0.5);
  assert.equal(scrollProgress(3100, 200, 3900, 1000), 1);
  assert.equal(scrollProgress(5000, 200, 3900, 1000), 1);
});

test("mobile landing entry resets only the unanchored mobile page", () => {
  assert.equal(shouldResetLandingScroll(699, ""), true);
  assert.equal(shouldResetLandingScroll(700, ""), false);
  assert.equal(shouldResetLandingScroll(390, "#how-it-works"), false);
});

test("regional landing links always point to the other deployment", () => {
  assert.deepEqual(alternateLandingSite("global"), {
    href: "https://trip-planner-cn-306129-11-1253819205.sh.run.tcloudbase.com/",
    message: "Go to China site",
  });
  assert.deepEqual(alternateLandingSite("cn"), {
    href: "https://trip-planner-ivory-one.vercel.app/",
    message: "Go to Global site",
  });
  assert.equal(translateMessage("zh-CN", "Go to China site"), "前往中国站");
  assert.equal(translateMessage("zh-CN", "Go to Global site"), "前往全球站");
});

test("mobile workspace preserves its side and bottom gutters", () => {
  const short = mobileWorkspaceLayout(375, 667, 331, 410);
  assert.equal(short.top, 355);
  assert.ok(Math.abs(short.scale - 288 / 410) < 1e-9);
  assert.ok(Math.abs(short.width * short.scale - 355) < 1e-9);
  assert.ok(Math.abs(short.top + 410 * short.scale - 643) < 1e-9);

  const tall = mobileWorkspaceLayout(375, 932, 365, 410);
  assert.ok(Math.abs(tall.top - 447.36) < 1e-9);
  assert.equal(tall.scale, 1);
  assert.equal(tall.width, 355);
  assert.ok(tall.top + 410 <= 932 - 24);
});

test("dock states follow the specified transition boundaries", () => {
  assert.equal(dockState(0), "scattered");
  assert.equal(dockState(0.14), "routing");
  assert.equal(dockState(0.5), "docking");
  assert.equal(dockState(0.75), "assembled");
});

test("every fragment reaches its measured target before crossfade", () => {
  const start: FragmentTransform = {
    blur: 1.5,
    borderRadius: 16,
    depth: 60,
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
    assert.equal(result.depth, 0);
    assert.equal(result.blur, 0);
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
