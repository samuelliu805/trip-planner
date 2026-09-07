import assert from "node:assert/strict";
import test from "node:test";

import type { UploadInput } from "../../../platform/contracts/storage.ts";
import {
  handleShareImageFallbackUpload,
  MAX_SHARE_IMAGE_PART_BYTES,
  type ShareImageFallbackUploadDependencies,
} from "./fallback-upload-handler.ts";

const ownerId = "10000000-0000-4000-8000-000000000001";
const exportId = "20000000-0000-4000-8000-000000000002";
const versionId = "30000000-0000-4000-8000-000000000003";
const path = `${ownerId}/${exportId}/${versionId}/part-1.jpg`;

function uploadRequest(
  body: BodyInit = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  headers: Record<string, string> = {},
) {
  return new Request("http://127.0.0.1:3000/api/share-images/upload", {
    body,
    headers: {
      "content-type": "image/jpeg",
      host: "trip.example",
      origin: "https://trip.example",
      "x-forwarded-host": "trip.example",
      "x-forwarded-proto": "https",
      "x-trip-planner-share-image-path": path,
      "x-trip-planner-share-image-version": versionId,
      ...headers,
    },
    method: "POST",
  });
}

function dependencies(options: { pending?: boolean; userId?: string | null } = {}) {
  const uploads: UploadInput[] = [];
  const calls: Array<{ name: string; requestedName: string }> = [];
  const value: ShareImageFallbackUploadDependencies = {
    async getCurrentUser() {
      return options.userId === null ? null : { id: options.userId ?? ownerId };
    },
    async getDatabase() {
      return {
        rpc(name, parameters) {
          calls.push({ name, requestedName: parameters.requested_name });
          return Promise.resolve({
            data: options.pending ?? true,
            error: null,
          });
        },
      };
    },
    getStorage() {
      return {
        async upload(input) {
          uploads.push(input);
          return { path: input.path };
        },
      };
    },
  };
  return { calls, uploads, value };
}

test("authenticated same-origin fallback uploads only a pending owned JPEG", async () => {
  const state = dependencies();
  const response = await handleShareImageFallbackUpload(uploadRequest(), state.value);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(state.calls, [
    { name: "owns_pending_share_image_object_v1", requestedName: path },
  ]);
  assert.equal(state.uploads.length, 1);
  assert.deepEqual(state.uploads[0], {
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    cacheControl: "31536000",
    contentType: "image/jpeg",
    path,
    upsert: true,
  });
});

test("fallback rejects foreign origins and anonymous callers before reading or uploading", async () => {
  const foreign = dependencies();
  assert.equal(
    (
      await handleShareImageFallbackUpload(
        uploadRequest(undefined, { origin: "https://attacker.example" }),
        foreign.value,
      )
    ).status,
    403,
  );
  assert.equal(foreign.uploads.length, 0);

  const anonymous = dependencies({ userId: null });
  assert.equal(
    (await handleShareImageFallbackUpload(uploadRequest(), anonymous.value)).status,
    401,
  );
  assert.equal(anonymous.uploads.length, 0);
});

test("fallback rejects oversized, mistyped, and non-pending objects", async () => {
  const oversized = dependencies();
  assert.equal(
    (
      await handleShareImageFallbackUpload(
        uploadRequest(undefined, { "content-length": String(MAX_SHARE_IMAGE_PART_BYTES + 1) }),
        oversized.value,
      )
    ).status,
    413,
  );

  const mistyped = dependencies();
  assert.equal(
    (
      await handleShareImageFallbackUpload(
        uploadRequest(undefined, { "content-type": "image/png" }),
        mistyped.value,
      )
    ).status,
    415,
  );

  const forgedJpeg = dependencies();
  assert.equal(
    (
      await handleShareImageFallbackUpload(
        uploadRequest(new TextEncoder().encode("not actually a JPEG")),
        forgedJpeg.value,
      )
    ).status,
    415,
  );

  const nonPending = dependencies({ pending: false });
  assert.equal(
    (await handleShareImageFallbackUpload(uploadRequest(), nonPending.value)).status,
    409,
  );
  assert.equal(nonPending.uploads.length, 0);
});

test("fallback requires the authenticated owner and matching version", async () => {
  const wrongOwner = dependencies({ userId: "40000000-0000-4000-8000-000000000004" });
  assert.equal(
    (await handleShareImageFallbackUpload(uploadRequest(), wrongOwner.value)).status,
    403,
  );

  const wrongVersion = dependencies();
  assert.equal(
    (
      await handleShareImageFallbackUpload(
        uploadRequest(undefined, {
          "x-trip-planner-share-image-version": "50000000-0000-4000-8000-000000000005",
        }),
        wrongVersion.value,
      )
    ).status,
    403,
  );
});
