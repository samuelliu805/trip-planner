import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("Google photo request chain coalesces only in flight, uses saved IDs, and binds permissions", async () => {
  const output = await build({
    entryPoints: ["src/lib/providers/google/sharing/google-place-photo.server.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "server-only-test",
        setup(builder) {
          builder.onResolve({ filter: /^server-only$/ }, () => ({
            path: "empty",
            namespace: "test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "" }));
        },
      },
    ],
  });
  const provider = await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_PLACES_API_KEY;
  const originalRegion = process.env.APP_REGION;
  const calls = [];
  let unblock;
  const blocked = new Promise((resolve) => {
    unblock = resolve;
  });
  process.env.GOOGLE_PLACES_API_KEY = "local-test-only";
  process.env.APP_REGION = "global";
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/media?")) return new Response("expired", { status: 410 });
    await blocked;
    return Response.json({
      photos: [
        {
          name: "places/saved-place/photos/portrait",
          widthPx: 1000,
          heightPx: 2000,
          authorAttributions: [{ displayName: "Portrait author" }],
        },
        {
          name: "places/saved-place/photos/current",
          widthPx: 1600,
          heightPx: 1000,
          authorAttributions: [
            { displayName: "Author one", uri: "https://example.invalid/one" },
            { displayName: "Author two", uri: "https://example.invalid/two" },
          ],
        },
      ],
    });
  };
  try {
    const items = [
      { ref: "first", title: "Saved museum" },
      { ref: "second", title: "Saved museum again" },
    ];
    const sources = items.map((item) => ({ itemRef: item.ref, providerPlaceId: "saved-place" }));
    const first = provider.resolveGooglePlaceMedia("token-a", sources, items);
    const second = provider.resolveGooglePlaceMedia("token-b", sources, items);
    assert.equal(
      calls.length,
      1,
      "Concurrent requests for the same place share only the in-flight Details call.",
    );
    unblock();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.get("first")[0].url, a.get("second")[0].url);
    assert.notEqual(
      a.get("first")[0].url,
      b.get("first")[0].url,
      "Signed URLs cannot cross share tokens.",
    );
    assert.equal(a.get("first")[0].attributions.length, 2);
    const url = new URL(a.get("first")[0].url, "http://localhost");
    const photo = url.searchParams.get("photo"),
      signature = url.searchParams.get("signature");
    assert.equal(
      photo,
      "places/saved-place/photos/current",
      "Pick the landscape photo within the same Details response.",
    );
    assert.equal(a.get("first")[0].attributions[0].label, "Author one");
    assert.ok(
      provider.verifyGooglePhotoSignature("token-a", "first", "saved-place", photo, signature),
    );
    assert.equal(
      provider.verifyGooglePhotoSignature("token-b", "first", "saved-place", photo, signature),
      false,
    );
    assert.equal(
      provider.verifyGooglePhotoSignature("token-a", "second", "saved-place", photo, signature),
      false,
    );
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[0].options.headers["X-Goog-FieldMask"], "photos");
    await provider.resolveGooglePlaceMedia("token-a", sources, items);
    assert.equal(
      calls.length,
      2,
      "Later page requests refresh photo names instead of storing them.",
    );
    const media = await provider.fetchGooglePhotoMedia(photo, "saved-place");
    assert.equal(media.status, 410, "Expiry is preserved for the bounded browser repair.");
    assert.equal(calls.length, 3);
    const rendition = new URL(calls[2].url);
    assert.equal(rendition.searchParams.get("maxWidthPx"), "800");
    assert.equal(rendition.searchParams.get("maxHeightPx"), "800");
    assert.equal(await provider.fetchGooglePhotoMedia(photo, "another-place"), null);
    assert.equal(calls.length, 3);
    delete process.env.GOOGLE_PLACES_API_KEY;
    assert.equal((await provider.resolveGooglePlaceMedia("token-a", sources, items)).size, 0);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => !/searchText|searchNearby|autocomplete/.test(call.url)));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = originalKey;
    if (originalRegion === undefined) delete process.env.APP_REGION;
    else process.env.APP_REGION = originalRegion;
  }
});

test("photo API rejects revoked/changed shares before providers and preserves bounded error classes", async () => {
  const output = await build({
    entryPoints: ["src/app/api/public-place-photo/[token]/[itemRef]/route.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "authorized-photo-fixture",
        setup(builder) {
          builder.onResolve({ filter: /features\/sharing\/public-media-data$/ }, () => ({
            path: "permissions",
            namespace: "test",
          }));
          builder.onResolve({ filter: /providers\/places\/public-photo.server$/ }, () => ({
            path: "provider",
            namespace: "test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
            contents:
              args.path === "permissions"
                ? "export async function getPublicPlaceMediaSources() { return globalThis.photoRouteTest.sources; }"
                : "export async function resolvePublicPlaceMedia() { globalThis.photoRouteTest.resolves++; return new Map([[globalThis.photoRouteTest.ref,[{id:'test',source:'google_place',kind:'image',url:'/authorized-media'}]]]); } export function verifyPublicPhotoSignature() {return globalThis.photoRouteTest.signatureValid;} export async function fetchPublicPhotoMedia() {globalThis.photoRouteTest.media++;return globalThis.photoRouteTest.response;}",
          }));
        },
      },
    ],
  });
  const { GET } = await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
  const token = "11111111-1111-4111-8111-111111111111",
    ref = "a".repeat(64);
  globalThis.photoRouteTest = {
    sources: [],
    ref,
    resolves: 0,
    media: 0,
    signatureValid: true,
    response: null,
  };
  const state = globalThis.photoRouteTest;
  const invoke = (query) =>
    GET(new Request(`http://localhost/api/public-place-photo/${token}/${ref}?${query}`), {
      params: Promise.resolve({ token, itemRef: ref }),
    });
  try {
    const signed = `photo=places/saved/photos/current&signature=${"b".repeat(64)}`;
    assert.equal((await invoke("resolve=1")).status, 404);
    assert.equal((await invoke(signed)).status, 404);
    assert.equal(state.resolves, 0);
    assert.equal(state.media, 0);
    state.sources = [{ itemRef: ref, providerPlaceId: "saved" }];
    assert.equal((await invoke("resolve=1")).status, 200);
    assert.equal(state.resolves, 1);
    state.signatureValid = false;
    assert.equal((await invoke(signed)).status, 404);
    assert.equal(state.media, 0);
    state.signatureValid = true;
    for (const [upstream, expected] of [
      [400, 410],
      [404, 410],
      [410, 410],
      [401, 403],
      [403, 403],
      [429, 429],
      [500, 503],
    ]) {
      state.response = new Response(null, { status: upstream });
      const result = await invoke(signed);
      assert.equal(result.status, expected);
      assert.ok(result.headers.get("cache-control").includes("no-store"));
    }
    state.response = new Response("invalid", { headers: { "Content-Type": "text/html" } });
    assert.equal((await invoke(signed)).status, 503);
    state.sources = [];
    const calls = state.media;
    assert.equal((await invoke(signed)).status, 404);
    assert.equal(
      state.media,
      calls,
      "Permissions are reread before an already signed media URL is used.",
    );
  } finally {
    delete globalThis.photoRouteTest;
  }
});

test("photo candidate availability respects regional provider selection and configured keys", async () => {
  const output = await build({
    entryPoints: ["src/lib/providers/places/public-photo.server.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "server-only-test",
        setup(builder) {
          builder.onResolve({ filter: /^server-only$/ }, () => ({
            path: "empty",
            namespace: "test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "" }));
        },
      },
    ],
  });
  const { publicPlacePhotosConfigured } = await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
  const names = [
    "GOOGLE_PLACES_API_KEY",
    "NEXT_PUBLIC_MAPS_PROVIDER",
    "APP_REGION",
    "NEXT_PUBLIC_APP_REGION",
  ];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.GOOGLE_PLACES_API_KEY = "local-test-only";
    process.env.NEXT_PUBLIC_MAPS_PROVIDER = "amap";
    process.env.APP_REGION = "cn";
    process.env.NEXT_PUBLIC_APP_REGION = "cn";
    assert.equal(publicPlacePhotosConfigured(), false);
    process.env.NEXT_PUBLIC_MAPS_PROVIDER = "google";
    process.env.APP_REGION = "global";
    process.env.NEXT_PUBLIC_APP_REGION = "global";
    assert.equal(publicPlacePhotosConfigured(), true);
    delete process.env.GOOGLE_PLACES_API_KEY;
    assert.equal(publicPlacePhotosConfigured(), false);
  } finally {
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
});
