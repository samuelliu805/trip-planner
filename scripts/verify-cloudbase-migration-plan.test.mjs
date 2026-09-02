import assert from "node:assert/strict";
import test from "node:test";

import { verifyCloudBaseMigrationPlan } from "./verify-cloudbase-migration-plan.mjs";

const requiredVersion = "20260901181000";

function listWith(...versions) {
  return {
    data: {
      remote: {
        items: versions.map((version) => ({ version, name: `migration_${version}` })),
      },
    },
  };
}

function planWith(pending = [], overrides = {}) {
  return {
    data: {
      dryRun: true,
      executable: true,
      pending,
      ...overrides,
    },
  };
}

test("accepts an executable CloudBase dry run with the required version applied", () => {
  assert.deepEqual(
    verifyCloudBaseMigrationPlan(listWith("20260901180000", requiredVersion), planWith(), [
      requiredVersion,
    ]),
    { applied: 2 },
  );
});

test("fails before live UI tests when a candidate migration is pending", () => {
  assert.throws(
    () =>
      verifyCloudBaseMigrationPlan(
        listWith("20260901180000"),
        planWith([
          {
            Version: requiredVersion,
            Name: "provider_neutral_places_and_amap_public_routes",
            Status: "pending",
          },
        ]),
        [requiredVersion],
      ),
    (error) => {
      assert.match(error.message, /Required versions not applied: 20260901181000/);
      assert.match(
        error.message,
        /Pending migrations: 20260901181000_provider_neutral_places_and_amap_public_routes/,
      );
      assert.match(error.message, /separately approved dev change/);
      return true;
    },
  );
});

test("rejects a non-dry-run or non-executable migration result", () => {
  assert.throws(
    () =>
      verifyCloudBaseMigrationPlan(listWith(requiredVersion), planWith([], { dryRun: false }), [
        requiredVersion,
      ]),
    /dry-run was not executable/,
  );
  assert.throws(
    () =>
      verifyCloudBaseMigrationPlan(listWith(requiredVersion), planWith([], { executable: false }), [
        requiredVersion,
      ]),
    /dry-run was not executable/,
  );
});

test("rejects malformed CLI results without echoing their content", () => {
  assert.throws(
    () => verifyCloudBaseMigrationPlan({ error: { secret: "do-not-print" } }, planWith()),
    (error) => {
      assert.equal(
        error.message,
        "CloudBase migration verification returned an invalid bounded result.",
      );
      assert.doesNotMatch(error.message, /do-not-print/);
      return true;
    },
  );
});
