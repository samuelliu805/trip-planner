import assert from "node:assert/strict";
import test from "node:test";

import { verifyCleanupInvocationResult } from "./invoke-cloudbase-cleanup.mjs";

const validResult = {
  assets: { deletedAssets: 0 },
  backlog: false,
  shareImages: { revokedImages: 0 },
  status: "ok",
};

test("accepts only the deployed cleanup function's bounded success shape", () => {
  assert.equal(verifyCleanupInvocationResult({ result: validResult }), validResult);
  assert.deepEqual(
    verifyCleanupInvocationResult({ result: JSON.stringify(validResult) }),
    validResult,
  );
});

test("rejects malformed or unsuccessful cleanup function responses", () => {
  for (const result of [
    undefined,
    "not-json",
    {},
    { ...validResult, status: "error" },
    { ...validResult, backlog: "false" },
  ]) {
    assert.throws(() => verifyCleanupInvocationResult({ result }));
  }
});
