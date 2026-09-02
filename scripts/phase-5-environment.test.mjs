import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "phase-5-environment.mjs");

const globalEnvironment = {
  APP_REGION: "global",
  AUTH_PROVIDER: "supabase",
  CRON_SECRET: "test-cron-secret",
  DATA_PROVIDER: "supabase",
  NEXT_PUBLIC_APP_REGION: "global",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "test-browser-key",
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "test-map-id",
  NEXT_PUBLIC_MAPS_PROVIDER: "google",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.invalid",
  STORAGE_PROVIDER: "supabase",
  SUPABASE_SECRET_KEY: "test-server-key",
};

const cnEnvironment = {
  AMAP_JS_SECURITY_CODE: "test-amap-security-code",
  AMAP_WEB_SERVICE_KEY: "test-amap-web-key",
  APP_REGION: "cn",
  AUTH_PROVIDER: "cloudbase",
  CLOUDBASE_API_KEY: "test-cloudbase-api-key",
  CLOUDBASE_CAM_SECRET_ID: "test-cam-secret-id",
  CLOUDBASE_CAM_SECRET_KEY: "test-cam-secret-key",
  CLOUDBASE_ENV_ID: "test-cloudbase-env",
  CLOUDBASE_PUBLISHABLE_KEY: "test-cloudbase-publishable-key",
  CLOUDBASE_REGION: "ap-shanghai",
  CLOUDBASE_TEST_USER_A_PASSWORD: "test-user-a-password",
  CLOUDBASE_TEST_USER_B_PASSWORD: "test-user-b-password",
  DATA_PROVIDER: "cloudbase",
  NEXT_PUBLIC_AMAP_JS_API_KEY: "test-amap-browser-key",
  NEXT_PUBLIC_APP_REGION: "cn",
  NEXT_PUBLIC_CLOUDBASE_ENV_ID: "test-cloudbase-env",
  NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY: "test-cloudbase-publishable-key",
  NEXT_PUBLIC_CLOUDBASE_REGION: "ap-shanghai",
  NEXT_PUBLIC_MAPS_PROVIDER: "amap",
  STORAGE_PROVIDER: "cloudbase",
};

function run(environment) {
  return spawnSync(process.execPath, [script, "global", "--live"], {
    encoding: "utf8",
    env: environment,
  });
}

test("the Global live validator reports missing configuration names", () => {
  assert.equal(run(globalEnvironment).status, 0);
  const missing = { ...globalEnvironment };
  delete missing.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const result = run(missing);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /global requires NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID/);
  assert.doesNotMatch(result.stderr, /test-browser-key|test-server-key/);
});

test("the CN live validator requires CAM function-invoke credential names", () => {
  const runCn = (environment) =>
    spawnSync(process.execPath, [script, "cn", "--live"], {
      encoding: "utf8",
      env: environment,
    });
  assert.equal(runCn(cnEnvironment).status, 0);
  for (const name of ["CLOUDBASE_CAM_SECRET_ID", "CLOUDBASE_CAM_SECRET_KEY"]) {
    const missing = { ...cnEnvironment };
    delete missing[name];
    const result = runCn(missing);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`cn requires ${name}`));
    assert.doesNotMatch(result.stderr, /test-cam-secret-(?:id|key)/);
  }
});
