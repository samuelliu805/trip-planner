import assert from "node:assert/strict";
import test from "node:test";

import {
  printCloudBaseFailureEvidence,
  redactCloudBaseDiagnosticOutput,
} from "./cloudbase-run-failure-evidence.mjs";
import { deployCloudBaseRunWithEvidence } from "./deploy-cloudbase-run-with-evidence.mjs";

function record(overrides = {}) {
  return {
    DeployId: "012",
    Status: "normal",
    HasTraffic: true,
    FlowRatio: 100,
    IsReleasing: false,
    RunId: "run-012",
    BuildId: "build-012",
    ...overrides,
  };
}

function records(latest) {
  return { data: { DeployRecords: [latest] } };
}

function recordHistory(...entries) {
  return { data: { DeployRecords: entries } };
}

function sequence(values) {
  return async () => {
    assert.ok(values.length > 0, "fixture sequence was exhausted");
    return values.shift();
  };
}

test("redacts and bounds CloudBase failure diagnostics", () => {
  const secret = "configured-secret-value";
  const output = redactCloudBaseDiagnosticOutput(
    `${"x".repeat(20_000)}\nAuthorization: Bearer temporary-token\n${secret}\nsecurity-code`,
    { AMAP_JS_SECURITY_CODE: "security-code", CLOUDBASE_API_KEY: secret },
  );

  assert.match(output, /^\[earlier diagnostic output omitted\]/);
  assert.doesNotMatch(output, /temporary-token|configured-secret-value|security-code/);
  assert.match(output, /Authorization: \[REDACTED\]|Authorization: Bearer \[REDACTED\]/);
});

test("queries both build and process evidence for a failed source release", async () => {
  const calls = [];
  let output = "";
  await printCloudBaseFailureEvidence({
    cli: ["tcb"],
    deployId: "040",
    envId: "env-cn",
    record: { BuildId: "build-040", RunId: "run-040", Status: "deploy_failed" },
    serviceName: "trip-planner-cn",
    run: async (command, arguments_, options) => {
      calls.push({ command, arguments_, options });
      return { code: 0, errorOutput: "", output: '{"Logs":["safe"]}', timedOut: false };
    },
    write: (message) => {
      output += message;
    },
  });

  assert.equal(calls.length, 2);
  assert.ok(calls[0].arguments_.includes("--build-id"));
  assert.ok(calls[0].arguments_.includes("--service-name"));
  assert.ok(calls[1].arguments_.includes("--run-id"));
  assert.match(output, /deployment 040.*status=deploy_failed/);
  assert.match(output, /build evidence/);
  assert.match(output, /process evidence/);
});

test("starts after a failed latest record when an older healthy release remains", async () => {
  let deployCalls = 0;
  const result = await deployCloudBaseRunWithEvidence({
    deploy: async () => {
      deployCalls += 1;
      return true;
    },
    queryRecords: sequence([
      recordHistory(
        record({
          DeployId: "040",
          Status: "deploy_failed",
          HasTraffic: false,
          FlowRatio: 0,
        }),
        record({ DeployId: "039", RunId: "run-039" }),
      ),
      records(record({ DeployId: "041", RunId: "run-041" })),
    ]),
    registrationChecks: 1,
    releaseChecks: 1,
  });

  assert.equal(deployCalls, 1);
  assert.deepEqual(result, { deployId: "041", runId: "run-041" });
});

test("retries only after an unchanged record and waits for the registered release", async () => {
  const baseline = records(record({ DeployId: "011", RunId: "run-011" }));
  const pending = records(
    record({ Status: "deploying", HasTraffic: false, FlowRatio: 0, IsReleasing: true }),
  );
  const outcomes = [false, true];
  const delays = [];
  const result = await deployCloudBaseRunWithEvidence({
    attempts: 2,
    deploy: async () => outcomes.shift(),
    queryRecords: sequence([baseline, baseline, baseline, pending, records(record())]),
    registrationChecks: 2,
    registrationPollMs: 10,
    releaseChecks: 2,
    releasePollMs: 20,
    retryDelayMs: 30,
    waitImplementation: async (milliseconds) => delays.push(milliseconds),
  });

  assert.deepEqual(result, { deployId: "012", runId: "run-012" });
  assert.deepEqual(delays, [10, 30, 20]);
  assert.equal(outcomes.length, 0);
});

test("never retries after a failed command has registered a deployment", async () => {
  const deployCalls = [];
  const result = await deployCloudBaseRunWithEvidence({
    attempts: 3,
    deploy: async (attempt) => {
      deployCalls.push(attempt);
      return false;
    },
    queryRecords: sequence([
      records(record({ DeployId: "011", RunId: "run-011" })),
      records(record()),
    ]),
    registrationChecks: 1,
    releaseChecks: 1,
  });

  assert.deepEqual(result, { deployId: "012", runId: "run-012" });
  assert.deepEqual(deployCalls, [1]);
});

test("retries the immutable archive after a registered deployment fails", async () => {
  const deployCalls = [];
  const failedDeployments = [];
  const delays = [];
  const result = await deployCloudBaseRunWithEvidence({
    attempts: 3,
    deploy: async (attempt) => {
      deployCalls.push(attempt);
      return false;
    },
    onFailedDeployment: async (failure) => failedDeployments.push(failure),
    queryRecords: sequence([
      records(record({ DeployId: "011", RunId: "run-011" })),
      records(record({ Status: "build_failed", HasTraffic: false, FlowRatio: 0 })),
      records(record({ DeployId: "013", RunId: "run-013" })),
    ]),
    registrationChecks: 1,
    releaseChecks: 1,
    retryDelayMs: 30,
    waitImplementation: async (milliseconds) => delays.push(milliseconds),
  });

  assert.deepEqual(result, { deployId: "013", runId: "run-013" });
  assert.deepEqual(deployCalls, [1, 2]);
  assert.deepEqual(delays, [30]);
  assert.equal(failedDeployments.length, 1);
  assert.equal(failedDeployments[0].deployId, "012");
  assert.equal(failedDeployments[0].record.Status, "build_failed");
});

test("fails after every registered deployment reaches a terminal failure", async () => {
  const deployCalls = [];
  const failedDeployments = [];
  const delays = [];
  await assert.rejects(
    () =>
      deployCloudBaseRunWithEvidence({
        attempts: 3,
        deploy: async (attempt) => {
          deployCalls.push(attempt);
          return true;
        },
        onFailedDeployment: async ({ deployId }) => failedDeployments.push(deployId),
        queryRecords: sequence([
          records(record({ DeployId: "011", RunId: "run-011" })),
          records(record({ Status: "build_failed", HasTraffic: false, FlowRatio: 0 })),
          records(
            record({
              DeployId: "013",
              Status: "deploy_failed",
              HasTraffic: false,
              FlowRatio: 0,
            }),
          ),
          records(
            record({
              DeployId: "014",
              Status: "deploy_failed",
              HasTraffic: false,
              FlowRatio: 0,
            }),
          ),
        ]),
        registrationChecks: 1,
        releaseChecks: 1,
        retryDelayMs: 10,
        waitImplementation: async (milliseconds) => delays.push(milliseconds),
      }),
    /deployment 014 failed on the final attempt/,
  );
  assert.deepEqual(deployCalls, [1, 2, 3]);
  assert.deepEqual(failedDeployments, ["012", "013", "014"]);
  assert.deepEqual(delays, [10, 20]);
});

test("exhausts a bounded retry budget when every record stays unchanged", async () => {
  const baseline = records(record({ DeployId: "011", RunId: "run-011" }));
  let deployCalls = 0;
  await assert.rejects(
    () =>
      deployCloudBaseRunWithEvidence({
        attempts: 2,
        deploy: async () => {
          deployCalls += 1;
          return false;
        },
        queryRecords: sequence([baseline, baseline, baseline]),
        registrationChecks: 1,
        retryDelayMs: 1,
        waitImplementation: async () => undefined,
      }),
    /within the retry budget/,
  );
  assert.equal(deployCalls, 2);
});

test("does not retry a successful command whose release evidence stays missing", async () => {
  const baseline = records(record({ DeployId: "011", RunId: "run-011" }));
  let deployCalls = 0;
  await assert.rejects(
    () =>
      deployCloudBaseRunWithEvidence({
        attempts: 3,
        deploy: async () => {
          deployCalls += 1;
          return true;
        },
        queryRecords: sequence([baseline, baseline]),
        registrationChecks: 1,
      }),
    /source submission succeeded without observable release evidence/,
  );
  assert.equal(deployCalls, 1);
});

test("rejects a releasing baseline before invoking deploy", async () => {
  let deployCalls = 0;
  await assert.rejects(() =>
    deployCloudBaseRunWithEvidence({
      deploy: async () => {
        deployCalls += 1;
        return true;
      },
      queryRecords: async () =>
        records(record({ DeployId: "011", IsReleasing: true, RunId: "run-011" })),
    }),
  );
  assert.equal(deployCalls, 0);
});

test("rejects a failed baseline when no older healthy release remains", async () => {
  let deployCalls = 0;
  await assert.rejects(() =>
    deployCloudBaseRunWithEvidence({
      deploy: async () => {
        deployCalls += 1;
        return true;
      },
      queryRecords: async () =>
        records(
          record({
            DeployId: "040",
            Status: "deploy_failed",
            HasTraffic: false,
            FlowRatio: 0,
          }),
        ),
    }),
  );
  assert.equal(deployCalls, 0);
});
