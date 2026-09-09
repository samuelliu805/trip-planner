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

  const routeField = routeScene.scene.getObjectByName("route-field");
  assert.ok(routeField);
  routeScene.camera.aspect = 0.46;
  routeScene.render(0.5, 1_100, { x: 0, y: 0 });
  assert.deepEqual(routeField.scale.toArray(), [0.38, 1, 1]);
  assert.deepEqual(routeField.position.toArray(), [-0.8, -1.05, 0]);

  routeScene.camera.aspect = 0.8;
  routeScene.render(0.5, 1_200, { x: 0, y: 0 });
  assert.deepEqual(routeField.scale.toArray(), [0.5, 1, 1]);
  assert.deepEqual(routeField.position.toArray(), [-0.4, -0.3, 0]);

  assert.doesNotThrow(() => routeScene.render(0.8, 1_250, { x: 0, y: 0 }));
  routeScene.dispose();
});
