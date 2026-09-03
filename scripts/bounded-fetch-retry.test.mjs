import assert from "node:assert/strict";
import test from "node:test";

import { boundedRetryFetch } from "./lib/bounded-fetch-retry.mjs";

test("bounded fetch retries network failures and server errors with capped backoff", async () => {
  const delays = [];
  const outcomes = [
    new Error("connect timeout"),
    new Response(null, { status: 503 }),
    new Response("ok"),
  ];
  const response = await boundedRetryFetch(
    "https://provider.example.test",
    {},
    {
      attempts: 4,
      fetchImplementation: async () => {
        const outcome = outcomes.shift();
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      maximumDelayMs: 600,
      retryDelayMs: 500,
      waitImplementation: async (delay) => delays.push(delay),
    },
  );

  assert.equal(await response.text(), "ok");
  assert.deepEqual(delays, [500, 600]);
  assert.equal(outcomes.length, 0);
});

test("bounded fetch does not retry client or provider business responses", async () => {
  let calls = 0;
  const response = await boundedRetryFetch(
    "https://provider.example.test",
    {},
    {
      attempts: 6,
      fetchImplementation: async () => {
        calls += 1;
        return new Response('{"status":"0"}', { status: 403 });
      },
      waitImplementation: async () => assert.fail("client errors must not wait for retry"),
    },
  );

  assert.equal(response.status, 403);
  assert.equal(calls, 1);
});

test("bounded fetch stops at its exact attempt limit", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      boundedRetryFetch(
        "https://provider.example.test",
        {},
        {
          attempts: 3,
          fetchImplementation: async () => {
            calls += 1;
            throw new Error("offline");
          },
          waitImplementation: async () => undefined,
        },
      ),
    /offline/,
  );
  assert.equal(calls, 3);
});

test("bounded fetch preserves caller abort without another attempt", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(() =>
    boundedRetryFetch(
      "https://provider.example.test",
      { signal: controller.signal },
      {
        attempts: 6,
        fetchImplementation: async () => {
          calls += 1;
          controller.abort();
          throw new DOMException("aborted", "AbortError");
        },
        waitImplementation: async () => assert.fail("caller abort must not wait for retry"),
      },
    ),
  );
  assert.equal(calls, 1);
});
