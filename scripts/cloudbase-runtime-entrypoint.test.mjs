import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { injectCloudBaseRuntimePublicEnv } from "./cloudbase-runtime-entrypoint.mjs";

function fixture(content) {
  const root = mkdtempSync(join(tmpdir(), "cloudbase-runtime-env-"));
  mkdirSync(join(root, ".next/static/chunks"), { recursive: true });
  mkdirSync(join(root, ".next/server"), { recursive: true });
  writeFileSync(join(root, ".next/static/chunks/app.js"), content);
  writeFileSync(join(root, ".next/server/app.js"), content);
  writeFileSync(join(root, "server.js"), "server");
  return root;
}

test("injects CloudBase public runtime configuration without logging values", async (t) => {
  const root = fixture(
    [
      "__TRIP_PLANNER_CLOUDBASE_ENV_ID__",
      "__TRIP_PLANNER_CLOUDBASE_SERVER_KEY__",
      "__TRIP_PLANNER_CLOUDBASE_REGION__",
      "__TRIP_PLANNER_NEXT_PUBLIC_CLOUDBASE_ENV_ID__",
      "__TRIP_PLANNER_CLOUDBASE_PUBLIC_KEY__",
      "__TRIP_PLANNER_NEXT_PUBLIC_CLOUDBASE_REGION__",
      "__TRIP_PLANNER_AMAP_JS_API_KEY__",
      "__TRIP_PLANNER_SITE_URL__",
    ].join("|"),
  );
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const env = {
    CLOUDBASE_ENV_ID: "cn-production-environment",
    CLOUDBASE_PUBLISHABLE_KEY: "server-publishable",
    CLOUDBASE_REGION: "ap-shanghai",
    NEXT_PUBLIC_AMAP_JS_API_KEY: "amap-browser-key",
    NEXT_PUBLIC_CLOUDBASE_ENV_ID: "cn-production-environment",
    NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY: "browser-publishable",
    NEXT_PUBLIC_CLOUDBASE_REGION: "ap-shanghai",
    NEXT_PUBLIC_SITE_URL: "https://cn.example.com",
  };

  const result = await injectCloudBaseRuntimePublicEnv({ env, root });

  assert.deepEqual(result.names, [
    "CLOUDBASE_ENV_ID",
    "CLOUDBASE_PUBLISHABLE_KEY",
    "CLOUDBASE_REGION",
    "NEXT_PUBLIC_CLOUDBASE_ENV_ID",
    "NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_CLOUDBASE_REGION",
    "NEXT_PUBLIC_AMAP_JS_API_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ]);
  assert.equal(result.changedFiles, 2);
  const output = readFileSync(join(root, ".next/static/chunks/app.js"), "utf8");
  for (const value of Object.values(env))
    assert.match(output, new RegExp(value.replaceAll(".", "\\.")));
  assert.doesNotMatch(output, /__TRIP_PLANNER_/);
});

test("fails closed when a placeholder has no matching runtime value", async (t) => {
  const root = fixture("__TRIP_PLANNER_AMAP_JS_API_KEY__");
  t.after(() => rmSync(root, { force: true, recursive: true }));

  await assert.rejects(
    injectCloudBaseRuntimePublicEnv({ env: {}, root }),
    /CloudBase runtime requires: NEXT_PUBLIC_AMAP_JS_API_KEY/,
  );
});

test("does not require runtime values for an already configured build", async (t) => {
  const root = fixture("already-built");
  t.after(() => rmSync(root, { force: true, recursive: true }));

  assert.deepEqual(await injectCloudBaseRuntimePublicEnv({ env: {}, root }), {
    changedFiles: 0,
    names: [],
  });
});
