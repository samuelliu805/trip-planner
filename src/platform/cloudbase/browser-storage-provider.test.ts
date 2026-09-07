import assert from "node:assert/strict";
import test from "node:test";

import { CloudBaseBrowserStorageProvider } from "./browser-storage-provider.ts";
import { normalizeCloudBaseStorageUrl } from "./storage-url.ts";

test("CloudBase signed storage URLs collapse duplicated gateway prefixes", () => {
  assert.equal(
    normalizeCloudBaseStorageUrl(
      "https://example.com/v1/storages/v1/storages/object/upload/sign/bucket/path?token=abc",
    ),
    "https://example.com/v1/storages/object/upload/sign/bucket/path?token=abc",
  );
});

test("CloudBase browser signed uploads use the authorized URL without a browser auth session", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    body: FormData;
    credentials?: RequestCredentials;
    method?: string;
    url: URL;
  }> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({
      body: init?.body as FormData,
      credentials: init?.credentials,
      method: init?.method,
      url: new URL(String(input)),
    });
    return new Response(JSON.stringify({ Key: "trip-assets/owner/item/file.jpg" }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    const result = await new CloudBaseBrowserStorageProvider("trip-assets").uploadToSignedUrl({
      body: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
      cacheControl: "3600",
      contentType: "image/jpeg",
      path: "owner/item/file.jpg",
      signedUrl:
        "https://storage.example/v1/storages/v1/storages/object/upload/sign/trip-assets/owner/item/file.jpg",
      token: "temporary-token",
      upsert: false,
    });

    assert.deepEqual(result, {
      fullPath: "trip-assets/owner/item/file.jpg",
      path: "owner/item/file.jpg",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url.searchParams.get("token"), "temporary-token");
    assert.equal(
      calls[0]?.url.pathname,
      "/v1/storages/object/upload/sign/trip-assets/owner/item/file.jpg",
    );
    assert.equal(calls[0]?.method, "PUT");
    assert.equal(calls[0]?.credentials, "omit");
    assert.equal(calls[0]?.body.get("cacheControl"), "3600");
    assert.equal(calls[0]?.body.get("contentType"), "image/jpeg");
    assert.ok(calls[0]?.body.get("") instanceof Blob);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudBase browser signed uploads tolerate an empty successful response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
  try {
    assert.deepEqual(
      await new CloudBaseBrowserStorageProvider("share-images").uploadToSignedUrl({
        body: new Blob(["image"], { type: "image/jpeg" }),
        contentType: "image/jpeg",
        path: "owner/export/part-1.jpg",
        signedUrl: "https://storage.example/upload?token=already-signed",
        token: "already-signed",
      }),
      {
        fullPath: "share-images/owner/export/part-1.jpg",
        path: "owner/export/part-1.jpg",
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudBase browser signed uploads do not wait for an unused successful response body", async () => {
  const originalFetch = globalThis.fetch;
  let canceled = false;
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        cancel() {
          canceled = true;
        },
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"Key":"ignored"'));
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  try {
    assert.deepEqual(
      await new CloudBaseBrowserStorageProvider("share-images").uploadToSignedUrl({
        body: new Blob(["image"]),
        path: "owner/export/part-1.jpg",
        signedUrl: "https://storage.example/upload?token=signed",
        token: "signed",
      }),
      {
        fullPath: "share-images/owner/export/part-1.jpg",
        path: "owner/export/part-1.jpg",
      },
    );
    assert.equal(canceled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudBase browser signed uploads retry transient server responses with bounded backoff", async () => {
  const originalFetch = globalThis.fetch;
  const delays: number[] = [];
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? new Response("bad gateway", { status: 502 })
      : new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    await new CloudBaseBrowserStorageProvider("share-images", {
      waitForRetry: async (milliseconds) => {
        delays.push(milliseconds);
      },
    }).uploadToSignedUrl({
      body: new Blob(["image"], { type: "image/jpeg" }),
      path: "owner/export/part-1.jpg",
      signedUrl: "https://storage.example/upload?token=signed",
      token: "signed",
    });

    assert.equal(calls, 2);
    assert.deepEqual(delays, [250]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudBase browser signed uploads retry network failures", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    await new CloudBaseBrowserStorageProvider("share-images", {
      waitForRetry: async () => undefined,
    }).uploadToSignedUrl({
      body: new Blob(["image"]),
      path: "owner/export/part-1.jpg",
      signedUrl: "https://storage.example/upload?token=signed",
      token: "signed",
    });

    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudBase browser signed uploads retry requests that exceed their deadline", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_input, init) => {
    calls += 1;
    if (calls > 1) return new Response(null, { status: 204 });
    return new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => undefined, 100);
      init?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(keepAlive);
          reject(init.signal?.reason);
        },
        { once: true },
      );
    });
  }) as typeof fetch;
  try {
    await new CloudBaseBrowserStorageProvider("share-images", {
      uploadTimeoutMs: 1,
      waitForRetry: async () => undefined,
    }).uploadToSignedUrl({
      body: new Blob(["image"]),
      path: "owner/export/part-1.jpg",
      signedUrl: "https://storage.example/upload?token=signed",
      token: "signed",
    });

    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudBase browser signed uploads do not retry client errors", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("bad request", { status: 400 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        new CloudBaseBrowserStorageProvider("share-images", {
          waitForRetry: async () => assert.fail("client errors must not wait for retry"),
        }).uploadToSignedUrl({
          body: new Blob(["image"]),
          path: "owner/export/part-1.jpg",
          signedUrl: "https://storage.example/upload?token=signed",
          token: "signed",
        }),
      /Signed storage upload returned 400/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CloudBase browser signed uploads stop at the transient retry limit", async () => {
  const originalFetch = globalThis.fetch;
  const delays: number[] = [];
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("bad gateway", { status: 502 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        new CloudBaseBrowserStorageProvider("share-images", {
          waitForRetry: async (milliseconds) => {
            delays.push(milliseconds);
          },
        }).uploadToSignedUrl({
          body: new Blob(["image"]),
          path: "owner/export/part-1.jpg",
          signedUrl: "https://storage.example/upload?token=signed",
          token: "signed",
        }),
      /Signed storage upload returned 502/,
    );
    assert.equal(calls, 3);
    assert.deepEqual(delays, [250, 500]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
