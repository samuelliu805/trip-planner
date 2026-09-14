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
  tabletWorkspaceLayout,
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
    href: "https://therewego.world/",
    message: "Go to Global site",
  });
  assert.equal(translateMessage("zh-CN", "Go to China site"), "前往中国站");
  assert.equal(translateMessage("zh-CN", "Go to Global site"), "前往全球站");
});

test("mobile workspace uses a native-size one-column viewport without scaling", () => {
  const short = mobileWorkspaceLayout(375, 667, 306);
  assert.equal(short.top, 342);
  assert.equal(short.scale, 1);
  assert.equal(short.width, 343);
  assert.equal(short.top + 250, 592);

  const tall = mobileWorkspaceLayout(375, 932, 365);
  assert.equal(tall.top, 401);
  assert.equal(tall.scale, 1);
  assert.equal(tall.width, 343);
  assert.ok(tall.top + 250 <= 932 - 84);
});

test("tablet workspace keeps a stable rail below the transformed preview", () => {
  const landscape = tabletWorkspaceLayout(1280, 807, 570);
  assert.equal(landscape.top, 137.19);
  assert.ok(landscape.scale < 1);
  assert.ok(landscape.top + 570 * landscape.scale <= 807 - 120);

  const portrait = tabletWorkspaceLayout(768, 1024, 570);
  assert.equal(portrait.top, 150);
  assert.equal(portrait.scale, 1);
  assert.ok(portrait.top + 570 <= 1024 - 120);

  const coarseLandscape = tabletWorkspaceLayout(1280, 800, 530, true);
  assert.equal(coarseLandscape.scale, 0.86);
  assert.ok(coarseLandscape.top + 530 * coarseLandscape.scale <= 800 - 190);
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
