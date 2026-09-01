import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { runCleanupJobs } from "../cloudbase/functions/shared/admin-cleanup.mjs";
import { isShareImageCleanupCronAuthorized } from "../src/app/api/cron/share-image-cleanup/authorization.mjs";

const jpegA = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const jpegB = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0xff, 0xd9]);
const timeoutMilliseconds = 20_000;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required live-test configuration: ${name}`);
  return value;
}

function withTimeout(operation, label) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMilliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

function success(result, label) {
  if (result.error)
    throw new Error(`${label}: ${result.error.code ?? "error"} ${result.error.message}`);
  return result.data;
}

function userClient(url, publishableKey) {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function stage(label, operation) {
  process.stdout.write(`Supabase Phase 4 stage: ${label}\n`);
  try {
    const result = await withTimeout(operation(), label);
    process.stdout.write(`Supabase Phase 4 stage passed: ${label}\n`);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(`${label} failed: ${detail}`);
  }
}

function adminBackend(admin, failPathOnce) {
  return {
    database: admin,
    storage(bucket) {
      return {
        async remove(paths) {
          if (failPathOnce.value && paths.includes(failPathOnce.path)) {
            failPathOnce.value = false;
            throw new Error("fixture storage removal failed");
          }
          const result = await admin.storage.from(bucket).remove(paths);
          if (result.error) throw result.error;
        },
      };
    },
  };
}

async function controlledPrefixCount(admin, ownerIds) {
  let count = 0;
  for (const bucket of ["trip-assets", "share-images"]) {
    for (const ownerId of ownerIds) {
      const result = await withTimeout(
        admin.storage.from(bucket).list(ownerId, { limit: 100 }),
        `controlled prefix audit for ${bucket}`,
      );
      count += success(result, `controlled prefix audit for ${bucket}`).length;
    }
  }
  return count;
}

async function plannedTemporaryUsers(admin, plannedEmails) {
  const matches = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await withTimeout(
      admin.auth.admin.listUsers({ page, perPage: 1000 }),
      `temporary user residue audit page ${page}`,
    );
    const listed = success(result, `temporary user residue audit page ${page}`).users ?? [];
    matches.push(...listed.filter((user) => plannedEmails.has(user.email)));
    if (listed.length < 1000) break;
  }
  return matches;
}

async function run() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = required("SUPABASE_SECRET_KEY");
  const cronSecret = required("CRON_SECRET");
  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const suffix = randomUUID();
  const password = `${randomBytes(24).toString("base64url")}aA1!`;
  const plannedEmails = new Set(["a", "b"].map((label) => `phase4-${label}-${suffix}@example.com`));
  const users = [];
  const controlledPaths = [];
  const assetIds = [];
  let failure = null;

  try {
    for (const label of ["a", "b"]) {
      const created = await stage(`create temporary user ${label.toUpperCase()}`, () =>
        admin.auth.admin.createUser({
          email: `phase4-${label}-${suffix}@example.com`,
          email_confirm: true,
          password,
        }),
      );
      const user = success(created, `create temporary user ${label.toUpperCase()}`).user;
      assert.ok(user?.id);
      users.push(user);
    }

    const clients = users.map((user) => {
      const client = userClient(url, publishableKey);
      return { client, email: user.email, id: user.id };
    });
    for (const entry of clients) {
      const signedIn = await stage(
        `sign in temporary user ${entry.id === users[0].id ? "A" : "B"}`,
        () => entry.client.auth.signInWithPassword({ email: entry.email, password }),
      );
      assert.equal(success(signedIn, "temporary user sign-in").user?.id, entry.id);
    }

    const bAssetId = randomUUID();
    const bPath = `${clients[1].id}/${bAssetId}/original`;
    controlledPaths.push(["trip-assets", bPath]);
    const bSignedUpload = success(
      await stage("service authorizes user B upload", () =>
        admin.storage.from("trip-assets").createSignedUploadUrl(bPath, { upsert: false }),
      ),
      "service authorizes user B upload",
    );
    success(
      await stage("user B uploads private fixture", () =>
        clients[1].client.storage
          .from("trip-assets")
          .uploadToSignedUrl(bPath, bSignedUpload.token, jpegA, { contentType: "image/jpeg" }),
      ),
      "user B uploads private fixture",
    );
    assert.ok(
      (
        await stage("user A cannot sign B object", () =>
          clients[0].client.storage.from("trip-assets").createSignedUrl(bPath, 60),
        )
      ).error,
    );
    assert.ok(
      (
        await stage("user A cannot retrieve B object", () =>
          clients[0].client.storage.from("trip-assets").download(bPath),
        )
      ).error,
    );

    const assetId = randomUUID();
    const path = `${clients[0].id}/${assetId}/original`;
    controlledPaths.push(["trip-assets", path]);
    const signedUpload = success(
      await stage("service-authorized signed upload", () =>
        admin.storage.from("trip-assets").createSignedUploadUrl(path, { upsert: false }),
      ),
      "service-authorized signed upload",
    );
    success(
      await stage("user A uploads with the signed token", () =>
        clients[0].client.storage
          .from("trip-assets")
          .uploadToSignedUrl(path, signedUpload.token, jpegA, { contentType: "image/jpeg" }),
      ),
      "user A signed upload",
    );

    const signedUpsert = success(
      await stage("service-authorized upsert token", () =>
        admin.storage.from("trip-assets").createSignedUploadUrl(path, { upsert: true }),
      ),
      "service-authorized upsert token",
    );
    success(
      await stage("signed upsert", () =>
        clients[0].client.storage
          .from("trip-assets")
          .uploadToSignedUrl(path, signedUpsert.token, jpegB, { contentType: "image/jpeg" }),
      ),
      "signed upsert",
    );

    const preview = success(
      await stage("preview signed URL", () =>
        admin.storage.from("trip-assets").createSignedUrl(path, 60),
      ),
      "preview signed URL",
    );
    const download = await stage("preview download", () => fetch(preview.signedUrl));
    assert.equal(download.ok, true);
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), jpegB);

    const bRead = await stage("user B read denial", () =>
      clients[1].client.storage.from("trip-assets").download(path),
    );
    assert.ok(bRead.error);
    const bSignedUrl = await stage("user B signed URL denial", () =>
      clients[1].client.storage.from("trip-assets").createSignedUrl(path, 60),
    );
    assert.ok(bSignedUrl.error);
    const bOverwrite = await stage("user B overwrite denial", () =>
      clients[1].client.storage
        .from("trip-assets")
        .upload(path, jpegA, { contentType: "image/jpeg", upsert: true }),
    );
    assert.ok(bOverwrite.error);
    await stage("user B idempotent delete attempt", () =>
      clients[1].client.storage.from("trip-assets").remove([path]),
    );
    const afterBDelete = success(
      await stage("service verifies B did not delete A object", () =>
        admin.storage.from("trip-assets").download(path),
      ),
      "service verifies B did not delete A object",
    );
    assert.deepEqual(new Uint8Array(await afterBDelete.arrayBuffer()), jpegB);

    const anonymous = userClient(url, publishableKey);
    const anonymousRead = await stage("anonymous read denial", () =>
      anonymous.storage.from("trip-assets").download(path),
    );
    assert.ok(anonymousRead.error);

    assert.equal(
      isShareImageCleanupCronAuthorized(new Request("https://test.invalid"), undefined),
      false,
    );
    assert.equal(
      isShareImageCleanupCronAuthorized(
        new Request("https://test.invalid", { headers: { authorization: "Bearer wrong" } }),
        cronSecret,
      ),
      false,
    );
    assert.equal(
      isShareImageCleanupCronAuthorized(
        new Request("https://test.invalid", {
          headers: { authorization: `Bearer ${cronSecret}` },
        }),
        cronSecret,
      ),
      true,
    );

    const failedAssetId = randomUUID();
    const failedPath = `${clients[0].id}/${failedAssetId}/original`;
    assetIds.push(failedAssetId);
    controlledPaths.push(["trip-assets", failedPath]);
    success(
      await stage("upload failed-asset fixture", () =>
        admin.storage.from("trip-assets").upload(failedPath, jpegA, { contentType: "image/jpeg" }),
      ),
      "upload failed-asset fixture",
    );
    success(
      await stage("insert failed-asset fixture", () =>
        admin.from("assets").insert({
          byte_size: jpegA.byteLength,
          failure_reason: "phase4 live fixture",
          id: failedAssetId,
          media_kind: "image",
          mime_type: "image/jpeg",
          object_key: failedPath,
          owner_id: clients[0].id,
          pending_expires_at: null,
          sha256: "a".repeat(64),
          status: "failed",
        }),
      ),
      "insert failed-asset fixture",
    );

    const failPathOnce = { path: failedPath, value: true };
    await stage("failed cleanup records a retry", () =>
      runCleanupJobs(adminBackend(admin, failPathOnce), 100),
    );
    const queued = success(
      await stage("read cleanup retry fixture", () =>
        admin
          .from("asset_deletion_queue")
          .select("attempts")
          .eq("asset_id", failedAssetId)
          .single(),
      ),
      "read cleanup retry fixture",
    );
    assert.equal(queued.attempts, 1);
    success(
      await stage("release cleanup retry fixture", () =>
        admin
          .from("asset_deletion_queue")
          .update({ next_attempt_at: new Date(0).toISOString() })
          .eq("asset_id", failedAssetId),
      ),
      "release cleanup retry fixture",
    );
    const cleanup = await stage("valid Cron cleanup execution", () =>
      runCleanupJobs(adminBackend(admin, { path: "", value: false }), 100),
    );
    assert.equal(cleanup.error, null);
    const cleanedAsset = await stage("verify failed asset finalized", () =>
      admin.from("assets").select("id", { count: "exact", head: true }).eq("id", failedAssetId),
    );
    success(cleanedAsset, "verify failed asset finalized");
    assert.equal(cleanedAsset.count, 0);
    const cleanedObject = await stage("verify failed object removed", () =>
      admin.storage.from("trip-assets").download(failedPath),
    );
    assert.ok(cleanedObject.error);
  } catch (error) {
    failure = error;
  } finally {
    try {
      for (const [bucket, path] of controlledPaths) {
        const removed = await withTimeout(
          admin.storage.from(bucket).remove([path]),
          `fixture cleanup for ${bucket}`,
        );
        process.stdout.write(
          `Supabase fixture cleanup: ${bucket} object ${removed.error ? "failed" : "requested"}\n`,
        );
      }
      if (assetIds.length) {
        success(
          await withTimeout(
            admin.from("assets").delete().in("id", assetIds),
            "asset fixture cleanup",
          ),
          "asset fixture cleanup",
        );
        success(
          await withTimeout(
            admin.from("asset_deletion_queue").delete().in("asset_id", assetIds),
            "queue fixture cleanup",
          ),
          "queue fixture cleanup",
        );
      }

      for (const recovered of await plannedTemporaryUsers(admin, plannedEmails)) {
        if (!users.some((user) => user.id === recovered.id)) users.push(recovered);
      }
      const ownerIds = users.map((user) => user.id);
      if (ownerIds.length) {
        success(
          await withTimeout(
            admin.from("asset_deletion_queue").delete().in("owner_id", ownerIds),
            "owner queue fixture cleanup",
          ),
          "owner queue fixture cleanup",
        );
      }
      for (const user of users) {
        const deleted = await withTimeout(
          admin.auth.admin.deleteUser(user.id),
          "temporary user cleanup",
        );
        if (deleted.error) throw deleted.error;
      }

      const objectCount = await controlledPrefixCount(admin, ownerIds);
      let assetCount = 0;
      let queueCount = 0;
      if (ownerIds.length) {
        const assets = await withTimeout(
          admin
            .from("assets")
            .select("id", { count: "exact", head: true })
            .in("owner_id", ownerIds),
          "asset residue audit",
        );
        success(assets, "asset residue audit");
        assetCount = assets.count ?? 0;
        const queues = await withTimeout(
          admin
            .from("asset_deletion_queue")
            .select("asset_id", { count: "exact", head: true })
            .in("owner_id", ownerIds),
          "queue residue audit",
        );
        success(queues, "queue residue audit");
        queueCount = queues.count ?? 0;
      }
      const temporaryUserCount = (await plannedTemporaryUsers(admin, plannedEmails)).length;
      process.stdout.write(
        `Supabase zero-residue audit: objects=${objectCount}, assets=${assetCount}, queues=${queueCount}, temporary_users=${temporaryUserCount}.\n`,
      );
      assert.deepEqual(
        { assetCount, objectCount, queueCount, temporaryUserCount },
        { assetCount: 0, objectCount: 0, queueCount: 0, temporaryUserCount: 0 },
      );
    } catch (auditError) {
      const message = auditError instanceof Error ? auditError.message : "unknown audit error";
      process.stdout.write(`Supabase zero-residue audit failed: ${message.slice(0, 200)}\n`);
      failure = failure
        ? new AggregateError(
            [failure, auditError],
            "Supabase live suite failed and its residue audit did not complete",
          )
        : auditError;
    }
  }
  if (failure) throw failure;
  process.stdout.write("Supabase Phase 4 live suite passed with zero controlled residue.\n");
}

await run();
