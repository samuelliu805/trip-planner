import assert from "node:assert/strict";
import test from "node:test";

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

function sequence(values) {
  return async () => {
    assert.ok(values.length > 0, "fixture sequence was exhausted");
    return values.shift();
  };
}

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

test("stops immediately when the registered deployment fails", async () => {
  let deployCalls = 0;
  await assert.rejects(
    () =>
      deployCloudBaseRunWithEvidence({
        attempts: 3,
        deploy: async () => {
          deployCalls += 1;
          return false;
        },
        queryRecords: sequence([
          records(record({ DeployId: "011", RunId: "run-011" })),
          records(record({ Status: "build_failed", HasTraffic: false, FlowRatio: 0 })),
        ]),
        registrationChecks: 1,
        releaseChecks: 1,
      }),
    /registered a failed deployment/,
  );
  assert.equal(deployCalls, 1);
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
    /succeeded without observable release evidence/,
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
