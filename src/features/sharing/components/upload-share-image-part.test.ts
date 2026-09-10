import assert from "node:assert/strict";
import test from "node:test";

import type { SignedUploadInput } from "../../../platform/contracts/storage.ts";
import { uploadShareImagePart } from "./upload-share-image-part.ts";

const input: Omit<SignedUploadInput, "body"> & { body: Blob; versionId: string } = {
  body: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }),
  cacheControl: "31536000",
  contentType: "image/jpeg",
  path: "10000000-0000-4000-8000-000000000001/export/version/part-1.jpg",
  signedUrl: "https://storage.example/upload?token=signed-secret",
  token: "signed-secret",
  upsert: false,
  versionId: "30000000-0000-4000-8000-000000000003",
};

test("share image upload does not call the fallback after a successful direct upload", async () => {
  let fallbackCalls = 0;
  await uploadShareImagePart(
    {
      async uploadToSignedUrl() {
        return { path: input.path };
      },
    },
    input,
    (async () => {
      fallbackCalls += 1;
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  );
  assert.equal(fallbackCalls, 0);
});

test("share image upload falls back to the authenticated same-origin route", async () => {
  const directFailure = new Error("direct route unavailable");
  let fallbackInput: RequestInfo | URL | undefined;
  let fallbackInit: RequestInit | undefined;

  await uploadShareImagePart(
    {
      async uploadToSignedUrl() {
        throw directFailure;
      },
    },
    input,
    (async (requestInput, requestInit) => {
      fallbackInput = requestInput;
      fallbackInit = requestInit;
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  );

  assert.equal(fallbackInput, "/api/share-images/upload");
  assert.equal(fallbackInit?.body, input.body);
  assert.equal(fallbackInit?.credentials, "same-origin");
  assert.equal(fallbackInit?.method, "POST");
  assert.deepEqual(fallbackInit?.headers, {
    "Content-Type": "image/jpeg",
    "X-Trip-Planner-Share-Image-Path": input.path,
    "X-Trip-Planner-Share-Image-Version": input.versionId,
  });
  assert.doesNotMatch(JSON.stringify(fallbackInit), /signed-secret|storage\.example/);
});

test("share image upload preserves the direct provider error when fallback also fails", async () => {
  const directFailure = new Error("direct route unavailable");
  const delays: number[] = [];
  let fallbackCalls = 0;
  await assert.rejects(
    uploadShareImagePart(
      {
        async uploadToSignedUrl() {
          throw directFailure;
        },
      },
      input,
      (async () => {
        fallbackCalls += 1;
        return new Response(null, { status: 502 });
      }) as typeof fetch,
      async (milliseconds) => {
        delays.push(milliseconds);
      },
    ),
    (error) => error === directFailure,
  );
  assert.equal(fallbackCalls, 3);
  assert.deepEqual(delays, [500, 1_000]);
});

test("share image upload retries a transient fallback failure", async () => {
  const delays: number[] = [];
  let fallbackCalls = 0;
  await uploadShareImagePart(
    {
      async uploadToSignedUrl() {
        throw new Error("direct route unavailable");
      },
    },
    input,
    (async () => {
      fallbackCalls += 1;
      return new Response(null, { status: fallbackCalls === 1 ? 502 : 204 });
    }) as typeof fetch,
    async (milliseconds) => {
      delays.push(milliseconds);
    },
  );

  assert.equal(fallbackCalls, 2);
  assert.deepEqual(delays, [500]);
});
