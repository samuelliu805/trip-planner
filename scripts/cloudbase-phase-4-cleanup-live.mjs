import assert from "node:assert/strict";

import {
  safeCloudBaseError,
  withCloudBaseHardTimeout,
} from "./lib/cloudbase-phase-4-live-requests.mjs";
import {
  cloudBasePhaseFourResidueRows,
  cloudBaseTestUserOwnerIds,
} from "./lib/cloudbase-phase-4-residue.mjs";
import { loadLiveConfig } from "./lib/cloudbase-pg-live.mjs";

const apiKey = process.env.CLOUDBASE_API_KEY;
if (!apiKey) throw new Error("CLOUDBASE_API_KEY is unavailable");
if (apiKey.trim() !== apiKey || /[\r\n{}]/.test(apiKey)) {
  throw new Error("CLOUDBASE_API_KEY has an invalid format");
}
// The management-plane SQL command regularly needs longer than application data requests.
const timeoutMilliseconds = 60_000;
const users = ["trip-planner-cn-test-a", "trip-planner-cn-test-b"];

async function run() {
  const config = loadLiveConfig();
  let failure = null;

  try {
    const cleanupEntry = await import("../cloudbase/functions/index.js");
    const main = cleanupEntry.main ?? cleanupEntry.default?.main;
    assert.equal(typeof main, "function");
    const result = await withCloudBaseHardTimeout(main, "cleanup handler", 45_000);
    assert.equal(result?.status, "ok");
    assert.equal(typeof result.backlog, "boolean");
    assert.equal(typeof result.assets?.deletedAssets, "number");
    assert.equal(typeof result.shareImages?.revokedImages, "number");
    process.stdout.write(
      "CloudBase cleanup handler completed independently with bounded output.\n",
    );
  } catch (error) {
    process.stdout.write(`CloudBase cleanup handler failed: ${safeCloudBaseError(error)}\n`);
    failure = error;
  } finally {
    try {
      const ownerIds = await cloudBaseTestUserOwnerIds(config, users, timeoutMilliseconds);
      const residue = await cloudBasePhaseFourResidueRows(config, ownerIds, timeoutMilliseconds);
      process.stdout.write(
        `CloudBase cleanup PG residue audit: ${residue.length} controlled object(s).\n`,
      );
      if (residue.length) {
        throw new Error(`cleanup PG residue audit found ${residue.length} controlled object(s)`);
      }
    } catch (auditError) {
      process.stdout.write(
        `CloudBase cleanup PG residue audit failed: ${safeCloudBaseError(auditError)}\n`,
      );
      failure = failure
        ? new AggregateError(
            [failure, auditError],
            "Cleanup handler failed and its residue audit was unavailable",
          )
        : auditError;
    }
  }

  if (failure) throw failure;
  process.stdout.write("CloudBase cleanup live suite passed with zero controlled residue.\n");
}

await run();
process.exit(0);
