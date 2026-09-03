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
      },
      ServerConfig: {
        EnvParams: JSON.stringify({ CLOUDBASE_APIKEY: fakeSecret }),
      },
      ...extra,
    },
  };
}

function createRunner(t) {
  const root = mkdtempSync(join(tmpdir(), "cloudbase-run-detail-"));
  let fixture = 0;
  t.after(() => rmSync(root, { force: true, recursive: true }));

  return (contents, expectedName = serviceName, ...args) => {
    const path = join(root, `detail-${fixture}.txt`);
    fixture += 1;
    writeFileSync(path, contents);
    const result = spawnSync(process.execPath, [script, path, expectedName, ...args], {
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
  const result = run(JSON.stringify(detail({ status: "paused" })));
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /CloudBase Run service trip-planner-cn is not Normal/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(fakeSecret));
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

test("requires a fully online version for the post-deploy gate", async (t) => {
  const run = createRunner(t);

  assertSafeFailure(
    run(
      JSON.stringify(detail({ extra: { OnlineVersionInfos: [] } })),
      serviceName,
      "--require-online-version",
    ),
  );

  await t.test("accepts a numeric 100% flow ratio", () => {
    const result = run(
      JSON.stringify(detail({ extra: { OnlineVersionInfos: [{ FlowRatio: 100 }] } })),
      serviceName,
      "--require-online-version",
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout.includes(fakeSecret), false);
  });

  await t.test("accepts the CloudBase string 100% flow ratio", () => {
    const result = run(
      JSON.stringify(detail({ extra: { OnlineVersionInfos: [{ FlowRatio: "100" }] } })),
      serviceName,
      "--require-online-version",
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout.includes(fakeSecret), false);
  });

  assertSafeFailure(
    run(
      JSON.stringify(detail({ extra: { OnlineVersionInfos: [{ FlowRatio: "99" }] } })),
      serviceName,
      "--require-online-version",
    ),
  );
});

test("checks required runtime variable names without exposing values", (t) => {
  const run = createRunner(t);
  const payload = detail();
  payload.data.ServerConfig.EnvParams = JSON.stringify({
    AMAP_JS_SECURITY_CODE: fakeSecret,
    AMAP_WEB_SERVICE_KEY: `${fakeSecret}-web`,
    EXISTING_RUNTIME_SETTING: "preserved",
  });
  const result = run(
    JSON.stringify(payload),
    serviceName,
    "--require-runtime-env",
    "AMAP_JS_SECURITY_CODE",
    "--require-runtime-env",
    "AMAP_WEB_SERVICE_KEY",
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /AMAP_JS_SECURITY_CODE, AMAP_WEB_SERVICE_KEY/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(fakeSecret), false);

  payload.data.ServerConfig.EnvParams = JSON.stringify({
    AMAP_JS_SECURITY_CODE: fakeSecret,
  });
  const missing = run(
    JSON.stringify(payload),
    serviceName,
    "--require-runtime-env",
    "AMAP_JS_SECURITY_CODE",
    "--require-runtime-env",
    "AMAP_WEB_SERVICE_KEY",
  );
  assert.notEqual(missing.status, 0);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /Missing required CloudBase Run runtime variable names/);
  assert.match(missing.stderr, /AMAP_WEB_SERVICE_KEY/);
  assert.doesNotMatch(`${missing.stdout}${missing.stderr}`, new RegExp(fakeSecret));
});

test("reports required names when runtime metadata is unavailable", (t) => {
  const run = createRunner(t);
  for (const unavailable of [undefined, "", "not-json", JSON.stringify([])]) {
    const payload = detail();
    payload.data.ServerConfig.EnvParams = unavailable;
    const result = run(
      JSON.stringify(payload),
      serviceName,
      "--require-runtime-env",
      "AMAP_JS_SECURITY_CODE",
      "--require-runtime-env",
      "AMAP_WEB_SERVICE_KEY",
    );
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Unable to inspect CloudBase Run runtime environment metadata/);
    assert.match(result.stderr, /AMAP_JS_SECURITY_CODE, AMAP_WEB_SERVICE_KEY/);
    assert.equal(`${result.stdout}${result.stderr}`.includes(fakeSecret), false);
  }
});

test("rejects runtime metadata nested under BaseInfo instead of the API ServerConfig field", (t) => {
  const run = createRunner(t);
  const payload = detail();
  delete payload.data.ServerConfig;
  payload.data.BaseInfo.ServerConfig = {
    EnvParams: JSON.stringify({ AMAP_JS_SECURITY_CODE: fakeSecret }),
  };
  const result = run(
    JSON.stringify(payload),
    serviceName,
    "--require-runtime-env",
    "AMAP_JS_SECURITY_CODE",
  );

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unable to inspect CloudBase Run runtime environment metadata/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(fakeSecret), false);
});
