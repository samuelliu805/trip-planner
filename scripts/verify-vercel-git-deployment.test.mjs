import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExactHealth,
  assertExactProductionDeploymentDetail,
  assertGlobalEnvironmentKeys,
  assertNoCloudBaseWarnings,
  exactProductionOrigin,
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

test("accepts the v6 list uid and v13 detail id for the same exact deployment", () => {
  const sha = "b".repeat(40);
  const selected = {
    uid: "dpl_ExactCandidate123",
    meta: { githubCommitSha: sha },
    state: "READY",
    target: "production",
  };
  const detail = {
    id: "dpl_ExactCandidate123",
    gitSource: { sha },
    project: { id: "prj_exact" },
    readyState: "READY",
    target: "production",
  };

  assert.equal(
    assertExactProductionDeploymentDetail(detail, selected, "prj_exact", sha),
    "dpl_ExactCandidate123",
  );
});

test("rejects conflicting or mismatched deployment detail metadata", () => {
  const sha = "c".repeat(40);
  const selected = {
    uid: "dpl_ExactCandidate123",
    meta: { githubCommitSha: sha },
    target: "production",
  };
  const detail = {
    id: "dpl_ExactCandidate123",
    meta: { githubCommitSha: sha },
    gitSource: { sha: "d".repeat(40) },
    projectId: "prj_exact",
    readyState: "READY",
    target: "production",
  };

  assert.throws(() => assertExactProductionDeploymentDetail(detail, selected, "prj_exact", sha));
  assert.throws(() =>
    assertExactProductionDeploymentDetail(
      { ...detail, gitSource: undefined, id: "dpl_OtherCandidate123" },
      selected,
      "prj_exact",
      sha,
    ),
  );
});

test("uses only a configured production origin assigned to the exact deployment", () => {
  const detail = {
    alias: ["trip-planner.example.test", "trip-planner-git-master.example.test"],
    url: "protected-unique-deployment.example.test",
  };

  assert.equal(
    exactProductionOrigin(detail, "https://trip-planner.example.test"),
    "https://trip-planner.example.test",
  );
  assert.throws(() => exactProductionOrigin(detail, "https://stale.example.test"));
  assert.throws(() => exactProductionOrigin(detail, "http://trip-planner.example.test"));
  assert.throws(() => exactProductionOrigin(detail, "https://trip-planner.example.test/login"));
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
