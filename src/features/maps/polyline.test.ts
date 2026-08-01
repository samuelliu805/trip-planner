import assert from "node:assert/strict";
import test from "node:test";
import { decodePolyline } from "./polyline.ts";

test("pinned polyline decoder decodes the canonical sample", () => {
  assert.deepEqual(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ]);
});
