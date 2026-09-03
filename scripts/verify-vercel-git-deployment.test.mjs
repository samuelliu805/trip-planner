import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExactHealth,
  assertGlobalEnvironmentKeys,
  assertNoCloudBaseWarnings,
  selectExactProductionDeployment,
} from "./verify-vercel-git-deployment.mjs";

test("selects only the exact production SHA", () => {
  const exact = { meta: { githubCommitSha: "a".repeat(40) }, target: "production", uid: "dpl" };
  assert.equal(
    selectExactProductionDeployment(
      { deployments: [{ ...exact, target: "preview" }, exact] },
      "a".repeat(40),
    ),
    exact,
  );
});

test("Global environment validation inspects names without requiring values", () => {
  assert.doesNotThrow(() =>
    assertGlobalEnvironmentKeys({ envs: [{ key: "SUPABASE_SECRET_KEY", target: ["production"] }] }),
  );
  assert.throws(
    () =>
      assertGlobalEnvironmentKeys({
        envs: [{ key: "CLOUDBASE_API_KEY", target: ["production"], value: "secret" }],
      }),
    /forbidden environment keys: CLOUDBASE_API_KEY/,
  );
  assert.throws(
    () =>
      assertGlobalEnvironmentKeys({
        envs: [{ key: "NEXT_PUBLIC_AMAP_JS_API_KEY", target: "production" }],
      }),
    /forbidden environment keys: NEXT_PUBLIC_AMAP_JS_API_KEY/,
  );
});

test("health and deployment logs fail closed", () => {
  assert.doesNotThrow(() => assertExactHealth({ status: "ok" }));
  assert.throws(() => assertExactHealth({ status: "ok", extra: true }));
  assert.doesNotThrow(() => assertNoCloudBaseWarnings([{ payload: { text: "ready" } }]));
  assert.throws(() => assertNoCloudBaseWarnings([{ payload: { text: "缺少依赖 ws" } }]));
});
