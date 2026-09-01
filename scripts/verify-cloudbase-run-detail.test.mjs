import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "verify-cloudbase-run-detail.mjs");
const serviceName = "trip-planner-cn";
const fakeSecret = 'FAKE_ENV_SECRET_{"quoted":"value"}';

function detail({ name = serviceName, status = "normal", extra = {} } = {}) {
  return {
    data: {
      BaseInfo: {
        ServerName: name,
        Status: status,
        ServerConfig: {
          EnvParams: `CLOUDBASE_APIKEY=${fakeSecret}`,
        },
      },
      ...extra,
    },
  };
}

function createRunner(t) {
  const root = mkdtempSync(join(tmpdir(), "cloudbase-run-detail-"));
  let fixture = 0;
  t.after(() => rmSync(root, { force: true, recursive: true }));

  return (contents, expectedName = serviceName) => {
    const path = join(root, `detail-${fixture}.txt`);
    fixture += 1;
    writeFileSync(path, contents);
    const result = spawnSync(process.execPath, [script, path, expectedName], {
      encoding: "utf8",
    });
    assert.equal(result.error, undefined);
    return result;
  };
}

function assertSafeFailure(result) {
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "CloudBase Run detail verification failed.\n");
  assert.equal(`${result.stdout}${result.stderr}`.includes(fakeSecret), false);
}

test("accepts clean CloudBase Run detail JSON with normal status", (t) => {
  const run = createRunner(t);
  const result = run(JSON.stringify(detail({ status: "NoRmAl" })));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "CloudBase Run service trip-planner-cn reports Status=normal.\n");
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes(fakeSecret), false);
});

test("accepts the real CloudBase progress line before valid JSON", (t) => {
  const run = createRunner(t);
  const result = run(`Retrieving Cloud Hosting Service Details...\n${JSON.stringify(detail())}\n`);

  assert.equal(result.status, 0);
});

test("accepts ANSI and BOM-prefixed CloudBase output", (t) => {
  const run = createRunner(t);
  const result = run(
    `\uFEFF\u001B[36mRetrieving Cloud Hosting Service Details...\u001B[0m\n${JSON.stringify(detail())}`,
  );

  assert.equal(result.status, 0);
});

test("rejects a detail response for the wrong service", (t) => {
  const run = createRunner(t);
  assertSafeFailure(run(JSON.stringify(detail({ name: "another-service" }))));
});

test("rejects an abnormal service status", (t) => {
  const run = createRunner(t);
  assertSafeFailure(run(JSON.stringify(detail({ status: "deploying" }))));
});

test("does not accept an unrelated nested normal status", (t) => {
  const run = createRunner(t);
  const payload = {
    data: {
      ServerConfig: { EnvParams: `CLOUDBASE_APIKEY=${fakeSecret}` },
      latestDeploy: { State: "normal", Status: "normal" },
    },
  };

  assertSafeFailure(run(JSON.stringify(payload)));
});

test("rejects missing and truncated JSON without exposing raw output", (t) => {
  const run = createRunner(t);

  assertSafeFailure(run("Retrieving Cloud Hosting Service Details...\n"));
  assertSafeFailure(
    run(
      `Retrieving Cloud Hosting Service Details...\n{"data":{"BaseInfo":{"ServerName":"${serviceName}","ServerConfig":{"EnvParams":"${fakeSecret}`,
    ),
  );
});
