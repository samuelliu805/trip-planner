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
