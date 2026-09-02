import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCloudBaseFunctionInvokeText,
  functionInvokeFailureGuidance,
} from "./describe-cloudbase-function-invoke.mjs";

test("classifies the pinned CLI Invoke denial without returning raw output", () => {
  assert.equal(
    classifyCloudBaseFunctionInvokeText(
      "[Invoke] Cam authentication failed requestId=hidden-value",
    ),
    "scf-invoke-authorization",
  );
  const guidance = functionInvokeFailureGuidance("scf-invoke-authorization");
  assert.match(guidance, /scf:Invoke/);
  assert.doesNotMatch(guidance, /hidden-value/);
});

test("classifies function lookup, absence, timeout, and unknown failures", () => {
  assert.equal(
    classifyCloudBaseFunctionInvokeText(
      "SyntaxError: Cannot use import statement outside a module",
    ),
    "function-runtime-module-format",
  );
  assert.equal(
    classifyCloudBaseFunctionInvokeText("[trip-planner-cleanup] 调用失败"),
    "function-invocation-failed",
  );
  assert.equal(
    classifyCloudBaseFunctionInvokeText("GetFunction permission denied"),
    "scf-get-function-authorization",
  );
  assert.equal(
    classifyCloudBaseFunctionInvokeText("trip-planner-cleanup does not exist"),
    "function-not-found",
  );
  assert.equal(classifyCloudBaseFunctionInvokeText("request timed out"), "timeout");
  assert.equal(classifyCloudBaseFunctionInvokeText("unclassified failure"), "unknown");
});
