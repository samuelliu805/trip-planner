import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaceResolutionOwner } from "../places/place-resolution-owner.ts";
import type { PlaceSnapshot } from "../../lib/providers/places/types.ts";

const scope = ["global", "actor-a", "trip", "plan"];
const place: PlaceSnapshot = {
  provider: "google",
  providerPlaceId: "A",
  displayName: "A",
  coordinateSystem: "wgs84",
  latitude: 30,
  longitude: 110,
};
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
function deferred() {
  let resolve!: (value: PlaceSnapshot) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<PlaceSnapshot>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("place resolution continues without a view and recovers its actual result", async () => {
  const storage = memory(),
    request = deferred();
  const owner = new PlaceResolutionOwner("field", scope, storage);
  let calls = 0;
  owner.start("A", null, () => {
    calls++;
    return request.promise;
  });
  request.resolve(place);
  await settle();
  const restored = new PlaceResolutionOwner("field", scope, storage);
  assert.equal(restored.snapshot()?.state, "ready");
  assert.deepEqual(restored.snapshot()?.result, place);
  assert.equal(calls, 1);
});

test("typing B cancels application of late A and allows an explicit B selection", async () => {
  const owner = new PlaceResolutionOwner("field", scope, memory());
  const a = deferred(),
    b = deferred();
  owner.start("A", null, () => a.promise);
  owner.invalidate();
  owner.start("B", null, () => b.promise);
  a.resolve(place);
  await settle();
  assert.equal(owner.snapshot()?.query, "B");
  assert.equal(owner.snapshot()?.state, "working");
  b.resolve({ ...place, displayName: "B", providerPlaceId: "B" });
  await settle();
  assert.equal(owner.snapshot()?.result?.displayName, "B");
});

test("a refresh never automatically repeats an interrupted paid request", () => {
  const storage = memory();
  const owner = new PlaceResolutionOwner("field", scope, storage);
  let calls = 0;
  owner.start("A", null, () => {
    calls++;
    return new Promise(() => {});
  });
  const restored = new PlaceResolutionOwner("field", scope, storage);
  assert.equal(restored.snapshot()?.state, "interrupted");
  assert.equal(restored.snapshot()?.query, "A");
  assert.equal(calls, 1);
});

test("persistence failure before acceptance incurs no paid request", () => {
  const owner = new PlaceResolutionOwner("field", scope, {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  });
  let calls = 0;
  assert.throws(
    () =>
      owner.start("A", null, async () => {
        calls++;
        return place;
      }),
    /quota/,
  );
  assert.equal(calls, 0);
});

test("a failed result checkpoint retains actual bytes and does not repeat the request", async () => {
  const storage = memory(),
    request = deferred();
  const owner = new PlaceResolutionOwner("field", scope, storage);
  let calls = 0;
  owner.start("A", null, () => {
    calls++;
    return request.promise;
  });
  storage.setItem = () => {
    throw new Error("quota after paid request");
  };
  request.resolve(place);
  await settle();
  assert.equal(owner.snapshot()?.state, "ready");
  assert.deepEqual(owner.snapshot()?.result, place);
  assert.match(owner.snapshot()?.error ?? "", /quota/);
  assert.equal(calls, 1);
});

test("a later tab checkpoint cannot be replaced by an earlier paid response", async () => {
  const storage = memory(),
    request = deferred();
  const owner = new PlaceResolutionOwner("field", scope, storage);
  owner.start("A", null, () => request.promise);
  storage.setItem(
    owner.storageKey,
    JSON.stringify({ id: crypto.randomUUID(), query: "B", before: "null", state: "cancelled" }),
  );
  request.resolve(place);
  await settle();
  owner.reload();
  assert.equal(owner.snapshot()?.query, "B");
  assert.equal(owner.snapshot()?.state, "cancelled");
});
