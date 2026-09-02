import assert from "node:assert/strict";
import test from "node:test";

import {
  camLoginFailureGuidance,
  classifyCloudBaseCamLoginFailure,
} from "./describe-cloudbase-cam-login.mjs";

test("classifies CAM credential and policy failures without returning CLI text", () => {
  assert.equal(
    classifyCloudBaseCamLoginFailure({
      error: { code: "ERROR", message: "Cam authentication failed leaked-secret-value" },
    }),
    "credential-authentication",
  );
  assert.equal(
    classifyCloudBaseCamLoginFailure({
      error: { code: "UnauthorizedOperation", message: "tcb:CheckTcbService denied" },
    }),
    "authorization",
  );
  assert.doesNotMatch(camLoginFailureGuidance("credential-authentication"), /leaked-secret-value/);
});
