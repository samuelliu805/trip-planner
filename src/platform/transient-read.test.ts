import assert from "node:assert/strict";
import test from "node:test";

import { retryTransientRead } from "./transient-read.ts";

test("transient reads retry thrown network failures with bounded backoff", async () => {
  const delays: number[] = [];
  let calls = 0;
  const result = await retryTransientRead(
    async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("fetch failed");
      return { data: "ready", error: null };
    },
    { retryDelayMs: 100, wait: async (delay) => void delays.push(delay) },
  );

  assert.deepEqual(result, { data: "ready", error: null });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
});

test("transient reads retry structured provider errors", async () => {
  let calls = 0;
  const result = await retryTransientRead(
    async () => {
      calls += 1;
      return calls === 1
        ? { data: null, error: { message: "TypeError: fetch failed" } }
        : { data: ["ready"], error: null };
    },
    { wait: async () => undefined },
  );

  assert.deepEqual(result, { data: ["ready"], error: null });
  assert.equal(calls, 2);
});

test("transient reads do not retry business errors", async () => {
  let calls = 0;
  const result = await retryTransientRead(
    async () => {
      calls += 1;
      return { data: null, error: { message: "Trip owner required" } };
    },
    { wait: async () => assert.fail("business errors must not wait") },
  );

  assert.deepEqual(result, { data: null, error: { message: "Trip owner required" } });
  assert.equal(calls, 1);
});
