import assert from "node:assert/strict";
import test from "node:test";
import { createPublicPhotoSession, type PlacePhoto } from "./public-photo-session.ts";

const media: PlacePhoto = {
  id: "google-place:item",
  source: "google_place",
  kind: "image",
  url: "/api/public-place-photo/token/item?photo=signed",
};
const sources = [
  { itemRef: "first", placeId: "shared" },
  { itemRef: "second", placeId: "shared" },
  { itemRef: "third", placeId: "other" },
];

test("one page lifetime shares resolutions and loaded images across days and consumers", async () => {
  const resolutions: string[] = [];
  let loads = 0;
  const released: string[] = [];
  const session = createPublicPhotoSession({
    sources,
    resolve: async (ref) => {
      resolutions.push(ref);
      return media;
    },
    load: async () => ({ status: 200, displayUrl: `blob:${++loads}` }),
    release: (url) => released.push(url),
  });
  const [first, second] = await Promise.all([session.get("first"), session.get("second")]);
  assert.equal(first, second);
  assert.equal(
    session.peek("second"),
    first,
    "A remounted consumer can read decoded pixels synchronously.",
  );
  assert.equal(session.peek("unshared"), undefined);
  await session.get("first");
  assert.deepEqual(resolutions, ["first"]);
  assert.equal(loads, 1);
  await session.get("third");
  assert.deepEqual(resolutions, ["first", "third"]);
  session.dispose();
  assert.deepEqual(released, ["blob:1", "blob:2"]);
  assert.equal(await session.get("first"), null);
  assert.equal(session.peek("first"), undefined);
});

test("only an expired resource repairs once and leaves other place resources intact", async () => {
  let resolves = 0;
  let loads = 0;
  const session = createPublicPhotoSession({
    sources,
    resolve: async () => {
      resolves++;
      return media;
    },
    load: async () =>
      ++loads === 1 ? { status: 410 } : { status: 200, displayUrl: `blob:${loads}` },
    release: () => undefined,
  });
  await session.get("first");
  assert.equal(resolves, 2);
  assert.equal(loads, 2);
  await session.get("second");
  assert.equal(resolves, 2);
  await session.get("third");
  assert.equal(resolves, 3);
});

for (const status of [401, 403, 404, 429, 500, 503]) {
  test(`status ${status} never retries or causes a remount storm`, async () => {
    let resolves = 0;
    const session = createPublicPhotoSession({
      sources,
      resolve: async () => {
        resolves++;
        return media;
      },
      load: async () => ({ status }),
      release: () => undefined,
    });
    assert.equal(await session.get("first"), null);
    assert.equal(await session.get("second"), null);
    assert.equal(await session.get("first"), null);
    assert.equal(resolves, 1);
  });
}

test("repeated expiry is bounded and unavailable sources never resolve", async () => {
  let resolves = 0;
  const session = createPublicPhotoSession({
    sources,
    resolve: async () => {
      resolves++;
      return media;
    },
    load: async () => ({ status: 410 }),
    release: () => undefined,
  });
  assert.equal(await session.get("first"), null);
  assert.equal(resolves, 2);
  assert.equal(await session.get("unshared"), null);
  assert.equal(resolves, 2);
});

test("disposing while a resource loads releases its URL and suppresses stale results", async () => {
  let finish!: (value: { status: number; displayUrl: string }) => void;
  const releases: string[] = [];
  const session = createPublicPhotoSession({
    sources,
    resolve: async () => media,
    load: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    release: (url) => releases.push(url),
  });
  const pending = session.get("first");
  await Promise.resolve();
  session.dispose();
  finish({ status: 200, displayUrl: "blob:late" });
  assert.equal(await pending, null);
  assert.deepEqual(releases, ["blob:late"]);
});
