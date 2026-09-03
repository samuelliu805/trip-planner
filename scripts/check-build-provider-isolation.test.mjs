import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { providerIsolationViolations } from "./check-build-provider-isolation.mjs";

function buildFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "provider-isolation-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(join(root, ".next/standalone/node_modules"), { recursive: true });
  mkdirSync(join(root, ".next/static/chunks"), { recursive: true });
  writeFileSync(join(root, ".next/standalone/server.js"), "server");
  return root;
}

test("accepts a standalone build without opposite-region providers", (t) => {
  const root = buildFixture(t);
  assert.deepEqual(providerIsolationViolations(root, "global"), []);
  assert.deepEqual(providerIsolationViolations(root, "cn"), []);
});

test("rejects opposite-region packages and runtime paths", (t) => {
  const root = buildFixture(t);
  mkdirSync(join(root, ".next/standalone/node_modules/@cloudbase/js-sdk"), { recursive: true });
  writeFileSync(
    join(root, ".next/standalone/node_modules/@cloudbase/js-sdk/index.js"),
    "缺少依赖 ws",
  );
  assert.equal(providerIsolationViolations(root, "global").length, 2);

  mkdirSync(join(root, ".next/standalone/node_modules/@supabase/ssr"), { recursive: true });
  writeFileSync(
    join(root, ".next/static/chunks/maps.js"),
    "https://maps.googleapis.com/maps/api/js",
  );
  assert.equal(providerIsolationViolations(root, "cn").length, 2);
});

test("rejects bundled CloudBase runtime signatures even without a traced package", (t) => {
  const root = buildFixture(t);
  writeFileSync(join(root, ".next/standalone/server.js"), 'const provider = "@cloudbase/js-sdk";');
  assert.deepEqual(providerIsolationViolations(root, "global"), [
    "Global runtime contains a CloudBase runtime or missing-ws path.",
  ]);
});
