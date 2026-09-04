import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  approvedCloudBaseTarget,
  createRegionEnvironment,
  createSanitizedEnvironment,
  readE2EInventory,
  requiredCredentials,
  validateRegionEnvironment,
} from "./e2e-env-contract.mjs";

function completeValues() {
  return {
    AMAP_JS_SECURITY_CODE: "amap-security",
    AMAP_WEB_SERVICE_KEY: "amap-service",
    CLOUDBASE_API_KEY: "cloudbase-server",
    CLOUDBASE_PUBLISHABLE_KEY: "cloudbase-public",
    CLOUDBASE_TEST_USER_A_PASSWORD: "user-a-password",
    CLOUDBASE_TEST_USER_B_PASSWORD: "user-b-password",
    CRON_SECRET: "cron-secret",
    GOOGLE_PLACES_API_KEY: "google-places",
    GOOGLE_ROUTES_API_KEY: "google-routes",
    NEXT_PUBLIC_AMAP_JS_API_KEY: "amap-browser",
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "google-browser",
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "google-map-id",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "supabase-public",
    NEXT_PUBLIC_SUPABASE_URL: "https://dev.example.supabase.co",
    SUPABASE_SECRET_KEY: "supabase-secret",
    ...approvedCloudBaseTarget,
  };
}

test("preflight reports only missing variable names", () => {
  const values = completeValues();
  delete values.CLOUDBASE_API_KEY;
  delete values.NEXT_PUBLIC_AMAP_JS_API_KEY;
  assert.deepEqual(validateRegionEnvironment("cn", values), {
    missing: ["CLOUDBASE_API_KEY", "NEXT_PUBLIC_AMAP_JS_API_KEY"],
    problems: [],
    ready: false,
  });
});

test("preflight pins the reviewed CloudBase target", () => {
  const values = { ...completeValues(), CLOUDBASE_ENV_ID: "production-target" };
  const result = validateRegionEnvironment("cn", values);
  assert.equal(result.ready, false);
  assert.deepEqual(result.problems, ["Unexpected CloudBase target: CLOUDBASE_ENV_ID"]);
  assert.equal(JSON.stringify(result).includes("production-target"), false);
});

test("regional environments do not expose opposite-provider credentials", () => {
  const values = completeValues();
  const inventory = { fileNames: Object.keys(values), values };
  const ambient = { HOME: "/tmp/test-home", PATH: "/usr/bin" };
  const global = createRegionEnvironment("global", inventory, ambient);
  const cn = createRegionEnvironment("cn", inventory, ambient);

  for (const name of requiredCredentials.cn) {
    assert.equal(global[name], "", `Global unexpectedly received ${name}`);
  }
  for (const name of requiredCredentials.global) {
    assert.equal(cn[name], "", `CN unexpectedly received ${name}`);
  }
  assert.equal(global.NEXT_PUBLIC_MAPS_PROVIDER, "google");
  assert.equal(cn.NEXT_PUBLIC_MAPS_PROVIDER, "amap");
  assert.equal(cn.NEXT_PUBLIC_CLOUDBASE_ENV_ID, approvedCloudBaseTarget.CLOUDBASE_ENV_ID);
  assert.equal(global.HOME, "/tmp/test-home");
});

test("CN live scripts use the sanitized environment proxy without inheriting Node options", () => {
  const values = completeValues();
  const inventory = { fileNames: Object.keys(values), values };
  const cn = createRegionEnvironment("cn", inventory, {
    HTTPS_PROXY: "http://127.0.0.1:7890",
    NODE_OPTIONS: "--inspect",
    PATH: "/usr/bin",
  });
  assert.equal(cn.HTTPS_PROXY, "http://127.0.0.1:7890");
  assert.equal(cn.NODE_OPTIONS, "--use-env-proxy");
});

test("static checks receive no application credentials", () => {
  const values = completeValues();
  const environment = createSanitizedEnvironment(Object.keys(values), {
    HOME: "/tmp/test-home",
    PATH: "/usr/bin",
  });
  for (const name of [...requiredCredentials.global, ...requiredCredentials.cn]) {
    assert.equal(environment[name], "", `Static checks unexpectedly received ${name}`);
  }
  assert.equal(environment.HOME, "/tmp/test-home");
});

test("ambient variables override the local file without exposing values in metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "trip-planner-e2e-"));
  const path = join(directory, ".env.local");
  try {
    writeFileSync(path, "CRON_SECRET=file-secret\nNEXT_PUBLIC_SUPABASE_URL=https://file.invalid\n");
    const inventory = readE2EInventory(path, { CRON_SECRET: "ambient-secret" });
    assert.equal(inventory.values.CRON_SECRET, "ambient-secret");
    assert.deepEqual(inventory.fileNames.sort(), ["CRON_SECRET", "NEXT_PUBLIC_SUPABASE_URL"]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
