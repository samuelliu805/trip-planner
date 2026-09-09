import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createRouteDockScene } from "./route-dock-scene.ts";

test("route scene follows scroll progress and pointer parallax without a renderer", () => {
  const routeScene = createRouteDockScene(THREE);
  const initialX = routeScene.camera.position.x;

  assert.doesNotThrow(() => routeScene.render(0.5, 1_000, { x: 1, y: -1 }));
  assert.ok(routeScene.camera.position.x > initialX);
  assert.ok(routeScene.camera.position.y > 0);
  assert.ok(routeScene.camera.position.z < 8);

  assert.doesNotThrow(() => routeScene.render(0.8, 1_250, { x: 0, y: 0 }));
  routeScene.dispose();
});
