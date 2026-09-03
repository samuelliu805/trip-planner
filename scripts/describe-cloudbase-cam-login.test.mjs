import assert from "node:assert/strict";
import test from "node:test";

import {
  camLoginFailureGuidance,
  classifyCloudBaseCamLoginFailure,
  classifyCloudBaseCamLoginText,
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
    "tcb-service-authorization",
  );
  assert.equal(
    classifyCloudBaseCamLoginFailure({
      error: { code: "UnauthorizedOperation", message: "tcb:DescribeBillingInfo denied" },
    }),
    "billing-info-authorization",
  );
  assert.match(camLoginFailureGuidance("billing-info-authorization"), /tcb:DescribeBillingInfo/);
  assert.doesNotMatch(camLoginFailureGuidance("credential-authentication"), /leaked-secret-value/);
});

test("classifies non-JSON and localized CAM CLI failures without returning their text", () => {
  assert.equal(
    classifyCloudBaseCamLoginText("CloudBaseError: Cam authentication failed"),
    "credential-authentication",
  );
  assert.equal(
    classifyCloudBaseCamLoginText("当前身份没有权限调用 tcb:CheckTcbService"),
    "tcb-service-authorization",
  );
  assert.equal(
    classifyCloudBaseCamLoginText("SecretKey 无效；do-not-repeat-this-value"),
    "credential-rejected",
  );
  assert.doesNotMatch(camLoginFailureGuidance("credential-rejected"), /do-not-repeat/);
});
