import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "verify-cloudbase-run-records.mjs");
const fakeSecret = "FAKE_RECORD_ENV_SECRET_DO_NOT_PRINT";

function record(overrides = {}) {
  return {
    DeployId: "004",
    Status: "normal",
    HasTraffic: true,
    FlowRatio: 100,
    IsReleasing: false,
    RunId: "run-004",
    BuildId: "build-004",
    ...overrides,
  };
}

function records(latest) {
  return {
    data: {
      DeployRecords: [latest, record({ DeployId: "003" })],
      ServerConfig: { EnvParams: `TOKEN=${fakeSecret}` },
    },
  };
}

function createRunner(t) {
  const root = mkdtempSync(join(tmpdir(), "cloudbase-run-records-"));
  let fixture = 0;
  t.after(() => rmSync(root, { force: true, recursive: true }));

  return (contents, mode, previousDeployId) => {
    const path = join(root, `records-${fixture}.txt`);
    fixture += 1;
    writeFileSync(path, contents);
    const args = [script, path, mode];
    if (previousDeployId !== undefined) args.push(previousDeployId);
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.error, undefined);
    return result;
  };
}

function assertSafeFailure(result) {
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "CloudBase Run deployment record verification failed.\n");
  assert.equal(`${result.stdout}${result.stderr}`.includes(fakeSecret), false);
}

test("extracts the latest DeployId from noisy CloudBase CLI output", (t) => {
  const run = createRunner(t);
  const result = run(
    `Querying deployment records...\n${JSON.stringify(records(record({ DeployId: "003" })))}`,
    "latest",
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "003\n");
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes(fakeSecret), false);
});

test("rejects an unchanged DeployId", (t) => {
  const run = createRunner(t);
  assertSafeFailure(run(JSON.stringify(records(record())), "released", "004"));
});

test("permits a retry only while the latest DeployId is unchanged", (t) => {
  const run = createRunner(t);
  const unchanged = run(JSON.stringify(records(record())), "unchanged", "004");

  assert.equal(unchanged.status, 0);
  assert.equal(unchanged.stdout, "CloudBase Run did not register a deployment.\n");
  assert.equal(unchanged.stderr, "");
  assert.equal(unchanged.stdout.includes(fakeSecret), false);
  assertSafeFailure(run(JSON.stringify(records(record())), "unchanged", "003"));
});

test("rejects non-normal deployment records", async (t) => {
  await t.test("build_failed", (subtest) => {
    const run = createRunner(subtest);
    assertSafeFailure(
      run(JSON.stringify(records(record({ Status: "build_failed" }))), "released", "003"),
    );
  });
  await t.test("deploying", (subtest) => {
    const run = createRunner(subtest);
    assertSafeFailure(
      run(JSON.stringify(records(record({ Status: "deploying" }))), "released", "003"),
    );
  });
  await t.test("running", (subtest) => {
    const run = createRunner(subtest);
    assertSafeFailure(
      run(JSON.stringify(records(record({ Status: "running" }))), "released", "003"),
    );
  });
});

test("rejects a normal deployment without traffic", async (t) => {
  await t.test("HasTraffic is false", (subtest) => {
    const run = createRunner(subtest);
    assertSafeFailure(
      run(JSON.stringify(records(record({ HasTraffic: false }))), "released", "003"),
    );
  });
  await t.test("FlowRatio is below 100", (subtest) => {
    const run = createRunner(subtest);
    assertSafeFailure(run(JSON.stringify(records(record({ FlowRatio: 0 }))), "released", "003"));
  });
});

test("accepts a new normal deployment with 100% traffic", (t) => {
  const run = createRunner(t);
  const result = run(JSON.stringify(records(record())), "released", "003");

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "CloudBase Run deployment is normal with 100% traffic.\n");
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes(fakeSecret), false);
});

test("does not expose fixture secrets when required release identifiers are missing", (t) => {
  const run = createRunner(t);
  assertSafeFailure(
    run(
      JSON.stringify(records(record({ BuildId: null, RunId: null, EnvParams: fakeSecret }))),
      "released",
      "003",
    ),
  );
});
