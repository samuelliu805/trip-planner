import assert from "node:assert/strict";
import test from "node:test";

import { waitForCloudBaseRunHealth } from "./verify-cloudbase-run-health.mjs";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

test("accepts only the fixed successful CloudBase Run health response", async () => {
  const healthy = await waitForCloudBaseRunHealth("https://example.com", {
    attempts: 1,
    delayMs: 0,
    fetchImpl: async () => response({ status: "ok" }),
    timeoutMs: 100,
  });
  const unexpected = await waitForCloudBaseRunHealth("https://example.com", {
    attempts: 1,
    delayMs: 0,
    fetchImpl: async () => response({ status: "ok", secret: "FAKE_HEALTH_SECRET_DO_NOT_PRINT" }),
    timeoutMs: 100,
  });

  assert.equal(healthy, true);
  assert.equal(unexpected, false);
});

test("requires HTTP 200 from the health endpoint", async () => {
  const healthy = await waitForCloudBaseRunHealth("https://example.com", {
    attempts: 1,
    delayMs: 0,
    fetchImpl: async () => response({ status: "ok" }, 503),
    timeoutMs: 100,
  });

  assert.equal(healthy, false);
});
