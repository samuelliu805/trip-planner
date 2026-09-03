import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyCleanupRuntimeFailure,
  verifyCloudBaseCleanupInvocation,
  verifyCleanupInvocationResult,
} from "./invoke-cloudbase-cleanup.mjs";

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

test("classifies bounded deployed cleanup runtime failures without exposing raw diagnostics", () => {
  assert.equal(
    classifyCleanupRuntimeFailure({
      errorMessage: "user code exception caught",
      stackTrace: "SyntaxError: Cannot use import statement outside a module",
      statusCode: 430,
    }),
    "node-module-format",
  );
  assert.equal(
    classifyCleanupRuntimeFailure({
      errorMessage: "Missing required cleanup runtime configuration: hidden-name",
      statusCode: 430,
    }),
    "runtime-configuration",
  );
  assert.equal(
    classifyCleanupRuntimeFailure({ errorCode: -1, statusCode: 430 }),
    "user-code-exception",
  );
  assert.equal(classifyCleanupRuntimeFailure({ status: "ok" }), null);
});

test("accepts only a successful bounded Event Function CLI response", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "cloudbase-cleanup-invoke-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const successPath = join(directory, "success.json");
  writeFileSync(
    successPath,
    JSON.stringify({
      data: {
        functionType: "Event",
        InvokeResult: 0,
        RetMsg: JSON.stringify(validResult),
      },
    }),
  );
  await assert.doesNotReject(() => verifyCloudBaseCleanupInvocation(successPath));

  for (const [index, invocation] of [
    { functionType: "Event", InvokeResult: 1, RetMsg: JSON.stringify(validResult) },
    { functionType: "HTTP", InvokeResult: 0, RetMsg: JSON.stringify(validResult) },
    { functionType: "Event", InvokeResult: 0, RetMsg: "not-json" },
  ].entries()) {
    const path = join(directory, `failure-${index}.json`);
    writeFileSync(path, JSON.stringify({ data: invocation }));
    await assert.rejects(() => verifyCloudBaseCleanupInvocation(path));
  }
});
