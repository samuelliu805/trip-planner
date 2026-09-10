import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createRouteDockScene } from "./route-dock-scene.ts";

function assertCircularWorldScale(
  object: THREE.Object3D,
  routeField: THREE.Object3D,
  message: string,
) {
  const worldScaleX = object.scale.x * routeField.scale.x;
  const worldScaleY = object.scale.y * routeField.scale.y;
  assert.ok(Math.abs(worldScaleX - worldScaleY) < 1e-9, message);
}

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
  assert.deepEqual(routeField.position.toArray(), [-0.8, -1.55, 0]);
  assertCircularWorldScale(
    routeScene.scene.getObjectByName("route-node-2")!,
    routeField,
    "mobile route nodes remain circular",
  );
  assertCircularWorldScale(
    routeScene.scene.getObjectByName("route-traveler")!,
    routeField,
    "mobile traveler remains circular",
  );
  assert.equal(routeScene.scene.getObjectByName("route-traveler")!.rotation.z, 0);
  assertCircularWorldScale(
    routeScene.scene.getObjectByName("route-arrival-ring")!,
    routeField,
    "mobile arrival ring remains circular",
  );

  routeScene.camera.aspect = 0.8;
  routeScene.render(0.5, 1_200, { x: 0, y: 0 });
  assert.deepEqual(routeField.scale.toArray(), [0.5, 1, 1]);
  assert.deepEqual(routeField.position.toArray(), [-0.4, -0.3, 0]);
  assertCircularWorldScale(
    routeScene.scene.getObjectByName("route-node-2")!,
    routeField,
    "tablet route nodes remain circular",
  );

  assert.doesNotThrow(() => routeScene.render(0.8, 1_250, { x: 0, y: 0 }));
  routeScene.dispose();
});
