import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { loadLiveConfig, signIn } from "./lib/cloudbase-pg-live.mjs";
import {
  isExpectedCloudBaseStorageDenial,
  isTransientCloudBaseFailure,
  requireCloudBaseStorageDenial,
  runCloudBaseSdkCall,
  safeCloudBaseError,
  withCloudBaseHardTimeout,
} from "./lib/cloudbase-phase-4-live-requests.mjs";
import {
  cloudBasePhaseFourResidueRows,
  cloudBaseTestUserOwnerIds,
} from "./lib/cloudbase-phase-4-residue.mjs";
import { normalizeCloudBaseRpcResult } from "../src/platform/cloudbase/rpc-result-normalization.mjs";

const require = createRequire(import.meta.url);
const cloudbase = require("@cloudbase/js-sdk");
const nodeAdapter = require("@cloudbase/adapter-node");
const userA = "trip-planner-cn-test-a";
const userB = "trip-planner-cn-test-b";
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const hardTimeoutMilliseconds = 15_000;
const execFileAsync = promisify(execFile);
const adminStorageWorker = fileURLToPath(
  new URL("./lib/cloudbase-phase-4-admin-storage-worker.mjs", import.meta.url),
);
const adminWorkerEnvironment = Object.fromEntries(
  [
    "CLOUDBASE_API_KEY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ].flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : [])),
);

function appFor(config, accessKey) {
  cloudbase.useAdapters(nodeAdapter);
  return cloudbase.init({
    accessKey,
    auth: { detectSessionInUrl: false },
    env: config.CLOUDBASE_ENV_ID,
    persistence: "none",
    region: config.CLOUDBASE_REGION,
  });
}

const hardTimeout = (operation, label) =>
  withCloudBaseHardTimeout(operation, label, hardTimeoutMilliseconds);
const sdkCall = (operation, label) =>
  runCloudBaseSdkCall(operation, label, { timeoutMilliseconds: hardTimeoutMilliseconds });
const safeError = safeCloudBaseError;

async function isolatedAdminStorageCall(action) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      process.execPath,
      [adminStorageWorker, JSON.stringify(action)],
      {
        env: adminWorkerEnvironment,
        maxBuffer: 1024 * 1024,
        timeout: hardTimeoutMilliseconds + 3_000,
      },
    ));
  } catch (error) {
    const workerError = new Error("CloudBase admin Storage worker process failed");
    workerError.code = error?.killed ? "HARD_TIMEOUT" : (error?.code ?? "WORKER_FAILED");
    throw workerError;
  }
  const marker = "CLOUDBASE_ADMIN_RESULT=";
  const start = stdout.lastIndexOf(marker);
  if (start < 0) throw new Error("CloudBase admin Storage worker returned invalid output");
  const payload = JSON.parse(stdout.slice(start + marker.length).trim());
  if (!payload || !("error" in payload) || !("data" in payload)) {
    throw new Error("CloudBase admin Storage worker returned an invalid result");
  }
  return payload;
}

const adminCall = (action, label) =>
  runCloudBaseSdkCall(() => isolatedAdminStorageCall(action), label, {
    timeoutMilliseconds: hardTimeoutMilliseconds + 4_000,
  });

async function stage(label, operation) {
  process.stdout.write(`CloudBase Phase 4 stage: ${label}\n`);
  const result = await operation();
  if (result?.error) throw new Error(`${label}: ${safeError(result.error)}`);
  process.stdout.write(`CloudBase Phase 4 stage passed: ${label}\n`);
  return result;
}

function data(result, label) {
  if (result?.error || result?.data == null) {
    throw new Error(`${label}: ${result?.error ? safeError(result.error) : "missing_data"}`);
  }
  return result.data;
}

async function denialStage(label, expected, operation) {
  process.stdout.write(`CloudBase Phase 4 stage: ${label}\n`);
  await requireCloudBaseStorageDenial({
    expected,
    label,
    operation,
    timeoutMilliseconds: hardTimeoutMilliseconds,
  });
  process.stdout.write(`CloudBase Phase 4 stage passed: ${label}\n`);
}

async function fetchDownload(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), hardTimeoutMilliseconds);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return response;
      lastError = Object.assign(new Error(`${label} returned ${response.status}`), {
        status: response.status,
      });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (!isTransientCloudBaseFailure(lastError) || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw new Error(`${label}: ${safeError(lastError)}`);
}

async function cleanTestUserResidue(config, ownerId) {
  const residue = await cloudBasePhaseFourResidueRows(config, [ownerId], hardTimeoutMilliseconds);
  for (const [index, object] of residue.entries()) {
    const result = await adminCall(
      { bucket: object.bucket_id, paths: [object.name], type: "remove" },
      `stale fixture cleanup ${index + 1}`,
    );
    if (result.error) throw new Error(`stale fixture cleanup: ${safeError(result.error)}`);
    if (!Array.isArray(result.data)) {
      throw new Error("stale fixture cleanup returned an invalid response");
    }
  }
  if (residue.length) {
    process.stdout.write(
      `CloudBase stale fixture cleanup requested: ${residue.length} object(s).\n`,
    );
  }
}

async function waitForZeroResidue(config, ownerIds) {
  let residue = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    residue = await cloudBasePhaseFourResidueRows(config, ownerIds, hardTimeoutMilliseconds);
    if (residue.length === 0 || attempt === 3) return residue;
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  return residue;
}

async function run() {
  const config = loadLiveConfig();
  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (!apiKey) throw new Error("CLOUDBASE_API_KEY is unavailable");
  if (apiKey.trim() !== apiKey || /[\r\n{}]/.test(apiKey)) {
    throw new Error("CLOUDBASE_API_KEY has an invalid format");
  }
  const userApp = appFor(config, config.CLOUDBASE_PUBLISHABLE_KEY);
  const auth = userApp.auth;
  const userDatabase = userApp.rdb();
  const tripAssets = userApp.storage.from("trip-assets");
  const shareImages = userApp.storage.from("share-images");
  const controlled = [];
  let failure = null;

  try {
    const aId = await stage("user A sign-in", () =>
      hardTimeout(
        () => signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD),
        "user A sign-in",
      ),
    );
    await stage("stale test-user residue cleanup", () => cleanTestUserResidue(config, aId));
    const staleResidue = await waitForZeroResidue(config, [aId]);
    if (staleResidue.length) {
      throw new Error(`stale test-user cleanup left ${staleResidue.length} controlled object(s)`);
    }
    const ownPath = `${aId}/${randomUUID()}/original`;
    const signedPath = `${aId}/${randomUUID()}/original`;
    const rejectedSharePath = `${aId}/${randomUUID()}/${randomUUID()}/part-1.jpg`;
    controlled.push(
      { bucket: "trip-assets", path: ownPath },
      { bucket: "trip-assets", path: signedPath },
      { bucket: "share-images", path: rejectedSharePath },
    );

    data(
      await stage("user A insert", () =>
        sdkCall(
          () => tripAssets.upload(ownPath, jpeg, { contentType: "image/jpeg", upsert: false }),
          "user A insert",
        ),
      ),
      "user A insert",
    );
    data(
      await stage("authenticated upsert", () =>
        sdkCall(
          () => tripAssets.upload(ownPath, jpeg, { contentType: "image/jpeg", upsert: true }),
          "authenticated upsert",
        ),
      ),
      "authenticated upsert",
    );
    const signedDownload = data(
      await stage("user A signed preview", () =>
        sdkCall(() => tripAssets.createSignedUrl(ownPath, 60), "user A signed preview"),
      ),
      "user A signed preview",
    );
    const downloaded = await stage("signed preview download", () =>
      fetchDownload(signedDownload.fullSignedURL, "signed preview download"),
    );
    assert.deepEqual(
      new Uint8Array(
        await hardTimeout(() => downloaded.arrayBuffer(), "signed preview response body"),
      ),
      jpeg,
    );

    await denialStage("MIME rejection", "mime", () =>
      tripAssets.upload(`${aId}/${randomUUID()}/original`, jpeg, {
        contentType: "text/plain",
      }),
    );
    await denialStage("size rejection", "size", () =>
      shareImages.upload(
        `${aId}/${randomUUID()}/${randomUUID()}/part-1.jpg`,
        new Uint8Array(10 * 1024 * 1024 + 1),
        { contentType: "image/jpeg" },
      ),
    );
    const pendingAuthorization = data(
      normalizeCloudBaseRpcResult(
        "owns_pending_share_image_object_v1",
        await stage("non-pending share authorization check", () =>
          sdkCall(
            () =>
              userDatabase.rpc("owns_pending_share_image_object_v1", {
                requested_name: rejectedSharePath,
              }),
            "non-pending share authorization check",
          ),
        ),
      ),
      "non-pending share authorization check",
    );
    assert.equal(pendingAuthorization, false);

    data(
      await stage("service creates share isolation fixture", () =>
        adminCall(
          {
            bucket: "share-images",
            bytes: Array.from(jpeg),
            contentType: "image/jpeg",
            path: rejectedSharePath,
            type: "upload",
            upsert: false,
          },
          "service creates share isolation fixture",
        ),
      ),
      "service creates share isolation fixture",
    );

    const uploadAuthorization = data(
      await stage("service signed-upload authorization", () =>
        adminCall(
          {
            bucket: "trip-assets",
            path: signedPath,
            type: "createSignedUploadUrl",
            upsert: false,
          },
          "service signed-upload authorization",
        ),
      ),
      "service signed-upload authorization",
    );
    data(
      await stage("signed upload", () =>
        sdkCall(
          () =>
            tripAssets.uploadToSignedUrl(signedPath, uploadAuthorization.token, jpeg, {
              contentType: "image/jpeg",
            }),
          "signed upload",
        ),
      ),
      "signed upload",
    );

    await stage("user A sign-out", () => sdkCall(() => auth.signOut(), "user A sign-out"));
    const bId = await stage("user B sign-in", () =>
      hardTimeout(
        () => signIn(auth, userB, config.CLOUDBASE_TEST_USER_B_PASSWORD),
        "user B sign-in",
      ),
    );
    assert.notEqual(bId, aId);
    const bOwnPath = `${bId}/${randomUUID()}/original`;
    controlled.push({ bucket: "trip-assets", path: bOwnPath });
    data(
      await stage("user B private upload", () =>
        sdkCall(
          () => tripAssets.upload(bOwnPath, jpeg, { contentType: "image/jpeg", upsert: false }),
          "user B private upload",
        ),
      ),
      "user B private upload",
    );
    await denialStage("user B download denial", "invisible", () =>
      tripAssets.createSignedUrl(ownPath, 60),
    );
    await denialStage("user B overwrite denial", "access", () =>
      tripAssets.upload(ownPath, jpeg, { contentType: "image/jpeg", upsert: true }),
    );
    process.stdout.write("CloudBase Phase 4 stage: user B delete attempt\n");
    const bDelete = await sdkCall(() => tripAssets.remove([ownPath]), "user B delete attempt");
    if (bDelete?.error && !isExpectedCloudBaseStorageDenial(bDelete.error, "invisible")) {
      throw new Error(`user B delete attempt: ${safeError(bDelete.error)}`);
    }
    process.stdout.write("CloudBase Phase 4 stage passed: user B delete attempt\n");
    const crossList = data(
      await stage("user B list isolation", () =>
        sdkCall(() => tripAssets.list(`${aId}/`, { limit: 100 }), "user B list isolation"),
      ),
      "user B list isolation",
    );
    assert.equal(crossList.objects.length, 0);
    assert.equal(crossList.folders.length, 0);

    await stage("user B sign-out", () => sdkCall(() => auth.signOut(), "user B sign-out"));
    await stage("user A isolation sign-in", () =>
      hardTimeout(
        () => signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD),
        "user A isolation sign-in",
      ),
    );
    await denialStage("user A cannot sign or retrieve B object", "invisible", () =>
      tripAssets.createSignedUrl(bOwnPath, 60),
    );
    await stage("user A isolation sign-out", () =>
      sdkCall(() => auth.signOut(), "user A isolation sign-out"),
    );
    const afterBDelete = data(
      await stage("service verifies B did not delete A object", () =>
        adminCall(
          { bucket: "trip-assets", path: ownPath, type: "createSignedUrl" },
          "service verifies B did not delete A object",
        ),
      ),
      "service verifies B did not delete A object",
    );
    const afterBDeleteDownload = await stage("service downloads object after B delete", () =>
      fetchDownload(afterBDelete.fullSignedURL, "service downloads object after B delete"),
    );
    assert.deepEqual(
      new Uint8Array(
        await hardTimeout(
          () => afterBDeleteDownload.arrayBuffer(),
          "service verification response body",
        ),
      ),
      jpeg,
    );
    const shareIsolationFixture = data(
      await stage("service verifies anonymous share fixture exists", () =>
        adminCall(
          {
            bucket: "share-images",
            path: rejectedSharePath,
            type: "createSignedUrl",
          },
          "service verifies anonymous share fixture exists",
        ),
      ),
      "service verifies anonymous share fixture exists",
    );
    const shareIsolationDownload = await stage("service downloads anonymous share fixture", () =>
      fetchDownload(
        shareIsolationFixture.fullSignedURL,
        "service downloads anonymous share fixture",
      ),
    );
    assert.deepEqual(
      new Uint8Array(
        await hardTimeout(
          () => shareIsolationDownload.arrayBuffer(),
          "share fixture verification response body",
        ),
      ),
      jpeg,
    );
    const anonymous = appFor(config, config.CLOUDBASE_PUBLISHABLE_KEY);
    await denialStage("anonymous asset denial", "invisible", () =>
      anonymous.storage.from("trip-assets").createSignedUrl(ownPath, 60),
    );
    await denialStage("anonymous share denial", "invisible", () =>
      anonymous.storage.from("share-images").createSignedUrl(rejectedSharePath, 60),
    );
  } catch (error) {
    failure = error;
  } finally {
    const signOutResult = await sdkCall(() => auth.signOut(), "final cleanup sign-out");
    process.stdout.write(
      `CloudBase final cleanup sign-out: ${signOutResult?.error ? `failed ${safeError(signOutResult.error)}` : "requested"}\n`,
    );
    for (const [index, fixture] of controlled.entries()) {
      const result = await adminCall(
        { bucket: fixture.bucket, paths: [fixture.path], type: "remove" },
        `fixture cleanup ${index + 1}`,
      );
      process.stdout.write(
        `CloudBase fixture cleanup ${index + 1}/${controlled.length}: ${result?.error ? `failed ${safeError(result.error)}` : "requested"}\n`,
      );
    }
    try {
      const auditOwnerIds = await cloudBaseTestUserOwnerIds(
        config,
        [userA, userB],
        hardTimeoutMilliseconds,
      );
      let residue = await waitForZeroResidue(config, auditOwnerIds);
      if (residue.length) {
        for (const [index, object] of residue.entries()) {
          const result = await adminCall(
            { bucket: object.bucket_id, paths: [object.name], type: "remove" },
            `residue recovery cleanup ${index + 1}`,
          );
          process.stdout.write(
            `CloudBase residue recovery cleanup ${index + 1}/${residue.length}: ${result?.error ? `failed ${safeError(result.error)}` : "requested"}\n`,
          );
        }
        residue = await waitForZeroResidue(config, auditOwnerIds);
      }
      process.stdout.write(`CloudBase PG residue audit: ${residue.length} controlled object(s).\n`);
      if (residue.length) {
        const residueError = new Error(
          `PG residue audit found ${residue.length} controlled object(s)`,
        );
        failure = failure
          ? new AggregateError([failure, residueError], "Live suite failed and residue remains")
          : residueError;
      }
    } catch (auditError) {
      process.stdout.write(`CloudBase PG residue audit unavailable: ${safeError(auditError)}\n`);
      failure = failure
        ? new AggregateError(
            [failure, auditError],
            "Live suite failed and residue audit was unavailable",
          )
        : auditError;
    }
  }

  if (failure) throw failure;
  process.stdout.write(
    "CloudBase Phase 4 storage live suite passed with zero controlled residue.\n",
  );
}

await run();
process.exit(0);
