import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupExpiredShareImages,
  runCleanupJobs,
} from "../cloudbase/functions/shared/admin-cleanup.mjs";
import { authorizePendingShareImageUpload } from "../src/features/sharing/long-image/storage-authorization.mjs";
import { normalizeCloudBaseRpcResult } from "../src/platform/cloudbase/rpc-result-normalization.mjs";
import {
  requireCloudBaseStorageDenial,
  safeCloudBaseError,
} from "./lib/cloudbase-phase-4-live-requests.mjs";

test("CloudBase unwraps only the exact boolean authorization wire envelope", () => {
  assert.deepEqual(
    normalizeCloudBaseRpcResult("owns_pending_share_image_object_v1", {
      data: { authorized: true },
      error: null,
    }),
    { data: true, error: null },
  );
  assert.deepEqual(
    normalizeCloudBaseRpcResult("owns_pending_share_image_object_v1", {
      data: { authorized: false },
      error: null,
    }),
    { data: false, error: null },
  );
  for (const data of [null, "true", {}, { authorized: 1 }, { authorized: true, extra: true }]) {
    const result = { data, error: null };
    assert.equal(normalizeCloudBaseRpcResult("owns_pending_share_image_object_v1", result), result);
  }
  const failed = { data: { authorized: true }, error: { message: "database unavailable" } };
  assert.equal(normalizeCloudBaseRpcResult("owns_pending_share_image_object_v1", failed), failed);
});

test("signed upload creation happens only after an explicit true ownership RPC", async () => {
  for (const response of [
    { data: false, error: null },
    { data: null, error: null },
    { data: "true", error: null },
    { data: true, error: { message: "database unavailable" } },
  ]) {
    let signedUploadCalls = 0;
    const result = await authorizePendingShareImageUpload({
      database: { rpc: async () => response },
      path: "owner/export/version/part-1.jpg",
      storage: {
        async createSignedUploadUrl() {
          signedUploadCalls += 1;
          return { signedUrl: "https://unused.invalid", token: "unused" };
        },
      },
    });
    assert.equal("error" in result, true);
    assert.equal(signedUploadCalls, 0);
  }

  const order = [];
  const result = await authorizePendingShareImageUpload({
    database: {
      async rpc(name, parameters) {
        order.push(`rpc:${name}:${parameters.requested_name}`);
        return { data: true, error: null };
      },
    },
    path: "owner/export/version/part-1.jpg",
    storage: {
      async createSignedUploadUrl(path) {
        order.push(`sign:${path}`);
        return { signedUrl: "https://example.invalid", token: "test-token" };
      },
    },
  });
  assert.equal("data" in result, true);
  assert.deepEqual(order, [
    "rpc:owns_pending_share_image_object_v1:owner/export/version/part-1.jpg",
    "sign:owner/export/version/part-1.jpg",
  ]);
});

test("cleanup jobs never overlap RPC calls on a shared backend", async () => {
  let active = 0;
  let maximumActive = 0;
  const calls = [];
  const backend = {
    database: {
      async rpc(name) {
        calls.push(name);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (active > 1) throw new Error("concurrent RPC rejected");
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (name === "expired_share_image_cleanup_batch_v1") return { data: [], error: null };
        if (name === "finalize_expired_share_image_cleanup_v1") return { data: 0, error: null };
        if (name === "asset_cleanup_batch_v2") return { data: [], error: null };
        if (name === "untracked_asset_storage_batch_v1") return { data: [], error: null };
        throw new Error(`Unexpected RPC: ${name}`);
      },
    },
    storage() {
      return { remove: async () => undefined };
    },
  };

  const result = await runCleanupJobs(backend, 100);
  assert.equal(maximumActive, 1);
  assert.deepEqual(calls, [
    "expired_share_image_cleanup_batch_v1",
    "finalize_expired_share_image_cleanup_v1",
    "asset_cleanup_batch_v2",
    "untracked_asset_storage_batch_v1",
  ]);
  assert.deepEqual(result, {
    assets: { deletedAssets: 0, deletedFiles: 0, error: null, untrackedFiles: 0 },
    backlog: false,
    error: null,
    shareImages: { deletedFiles: 0, error: null, revokedImages: 0 },
  });
});

test("cleanup preserves numeric shape for the CloudBase count envelope", async () => {
  const result = await cleanupExpiredShareImages({
    database: {
      async rpc(name) {
        if (name === "expired_share_image_cleanup_batch_v1") {
          return { data: [], error: null };
        }
        if (name === "finalize_expired_share_image_cleanup_v1") {
          return { data: { count: 0 }, error: null };
        }
        throw new Error(`Unexpected RPC: ${name}`);
      },
    },
    storage() {
      return { remove: async () => undefined };
    },
  });
  assert.deepEqual(result, { deletedFiles: 0, error: null, revokedImages: 0 });
});

test("CloudBase denial stages reject exhausted fetch failures", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      requireCloudBaseStorageDenial({
        backoffMilliseconds: 0,
        expected: "access",
        label: "fetch denial fixture",
        operation: async () => {
          calls += 1;
          throw new TypeError("fetch failed");
        },
        timeoutMilliseconds: 20,
      }),
    /unexpected rejection TypeError fetch failed/,
  );
  assert.equal(calls, 3);
});

test("CloudBase denial stages reject exhausted hard timeouts", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      requireCloudBaseStorageDenial({
        backoffMilliseconds: 0,
        expected: "access",
        label: "timeout denial fixture",
        operation: () => {
          calls += 1;
          return new Promise(() => undefined);
        },
        timeoutMilliseconds: 5,
      }),
    /unexpected rejection HARD_TIMEOUT timeout denial fixture timed out/,
  );
  assert.equal(calls, 3);
});

test("CloudBase denial stages reject unknown infrastructure errors", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      requireCloudBaseStorageDenial({
        backoffMilliseconds: 0,
        expected: "access",
        label: "unknown denial fixture",
        operation: async () => {
          calls += 1;
          return {
            data: null,
            error: Object.assign(new Error("unclassified infrastructure error"), {
              code: "UNKNOWN_INFRASTRUCTURE",
            }),
          };
        },
        timeoutMilliseconds: 20,
      }),
    /unexpected rejection UNKNOWN_INFRASTRUCTURE unclassified infrastructure error/,
  );
  assert.equal(calls, 1);
});

test("CloudBase denial stages stop on exact expected Storage denials", async () => {
  for (const [expected, error] of [
    [
      "access",
      {
        __isStorageError: true,
        message: "permission denied",
        name: "StorageApiError",
        status: 403,
        statusCode: "STORAGE_PERMISSION_DENIED",
      },
    ],
    [
      "mime",
      {
        __isStorageError: true,
        message: "MIME type is not allowed",
        name: "StorageApiError",
        status: 400,
        statusCode: "STORAGE_MIME_TYPE_NOT_ALLOWED",
      },
    ],
    [
      "invisible",
      {
        __isStorageError: true,
        message: "Object not found",
        name: "StorageApiError",
        status: 404,
        statusCode: "STORAGE_OBJECT_NOT_FOUND",
      },
    ],
    [
      "size",
      {
        __isStorageError: true,
        message: "File size limit exceeded",
        name: "StorageApiError",
        status: 413,
        statusCode: "STORAGE_FILE_SIZE_LIMIT_EXCEEDED",
      },
    ],
  ]) {
    let calls = 0;
    await requireCloudBaseStorageDenial({
      backoffMilliseconds: 0,
      expected,
      label: `${expected} denial fixture`,
      operation: async () => {
        calls += 1;
        return { data: null, error };
      },
      timeoutMilliseconds: 20,
    });
    assert.equal(calls, 1);
  }
});

test("CloudBase live diagnostics redact multiline bearer credentials", () => {
  const diagnostic = safeCloudBaseError(
    new Error('Headers.append: "Bearer {\n  "ApiKey": "secret-value"\n}" is invalid'),
  );
  assert.equal(diagnostic.includes("secret-value"), false);
  assert.match(diagnostic, /Bearer <redacted>/);
});
