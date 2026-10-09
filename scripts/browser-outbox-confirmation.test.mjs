import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { waitForTripOutbox } from "./lib/browser-outbox-confirmation.mjs";

const key = (trip, domain, id = "op") =>
  `trip-planner:${domain === "variants" ? "variants" : "actions"}-outbox:v1:${JSON.stringify(["global", "actor", trip, domain])}:${id}`;
const row = (status, extra = {}) =>
  JSON.stringify({ status, attempts: 1, dependsOn: [], ...extra });
function fixture(entries) {
  const localStorage = Object.assign(
    Object.create({ getItem: (key) => localStorage[key] }),
    entries,
  );
  return {
    localStorage,
    evaluate: async (_browser, expression) => runInNewContext(expression, { localStorage }),
  };
}
const options = { domains: ["variants", "idea-workflows"], label: "fixture confirmation" };

test("cold-navigation confirmation waits through preparation and ACK recovery, ignoring other scopes and receipt metadata", async () => {
  const operation = key("fixture-trip", "idea-workflows");
  const driver = fixture({
    [operation]: row("queued"),
    [key("other-trip", "idea-workflows")]: row("failed"),
    [key("fixture-trip", "images:other")]: row("failed"),
    [operation.replace("]:op", "]-receipt:op")]: "1",
  });
  let attempts = 0;
  await waitForTripOutbox(null, "fixture-trip", {
    ...options,
    evaluate: driver.evaluate,
    waitFor: async (browser, expression) => {
      attempts++;
      assert.equal(await driver.evaluate(browser, expression), null);
      driver.localStorage[operation] = row("acknowledged", { ack: { data: {} } });
      attempts++;
      assert.equal(await driver.evaluate(browser, expression), null);
      delete driver.localStorage[operation];
      attempts++;
      return driver.evaluate(browser, expression);
    },
  });
  assert.equal(attempts, 3);
});

test("a failed or conflicted application blocks cold-navigation acceptance and bounds diagnostics to queue metadata", async () => {
  for (const status of ["failed", "conflict"]) {
    const driver = fixture({
      [key("fixture-trip", "idea-workflows")]: row(status, {
        error: "stale baseline",
        intent: { privateInput: "must-not-appear" },
        wire: {
          token: "must-not-appear",
          input: { expectedResearchVersions: { "private-source-id": 2 } },
        },
      }),
    });
    await assert.rejects(
      () =>
        waitForTripOutbox(null, "fixture-trip", {
          ...options,
          evaluate: driver.evaluate,
          waitFor: driver.evaluate,
        }),
      (error) => {
        assert.match(error.message, /fixture confirmation failed/);
        assert.match(error.message, new RegExp(status));
        assert.match(error.message, /stale baseline/);
        assert.match(error.message, /sourceVersions.:\[2\]/);
        assert.doesNotMatch(error.message, /private-source-id/);
        assert.doesNotMatch(error.message, /must-not-appear/);
        return true;
      },
    );
  }
});

test("a stuck prerequisite remains a test failure with a bounded pending-queue diagnostic", async () => {
  const driver = fixture({
    [key("fixture-trip", "variants")]: row("sending", { dependsOn: ["parent"] }),
  });
  await assert.rejects(
    () =>
      waitForTripOutbox(null, "fixture-trip", {
        ...options,
        evaluate: driver.evaluate,
        waitFor: async () => {
          throw new Error("fixture timed out");
        },
      }),
    /fixture timed out; outbox:.*sending.*dependencies.:1/,
  );
});

test("confirmation exposes a failed source predecessor and ignores unrelated source failures", async () => {
  const driver = fixture({
    [key("fixture-trip", "target-plan")]: row("queued", { dependsOn: ["source-edit"] }),
    [key("fixture-trip", "source-plan", "source-edit")]: row("conflict", {
      error: "source changed",
      wire: { input: { sourceVersions: [3] } },
    }),
    [key("fixture-trip", "unrelated-plan")]: row("failed", { error: "must-not-appear" }),
  });
  await assert.rejects(
    () =>
      waitForTripOutbox(null, "fixture-trip", {
        domains: ["target-plan"],
        label: "copy confirmation",
        evaluate: driver.evaluate,
        waitFor: driver.evaluate,
      }),
    (error) => {
      assert.match(error.message, /source changed/);
      assert.match(error.message, /sourceVersions.:\[3\]/);
      assert.doesNotMatch(error.message, /must-not-appear|source-edit/);
      return true;
    },
  );
});
