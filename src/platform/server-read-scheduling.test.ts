import assert from "node:assert/strict";
import test from "node:test";

import { runParallelServerReads, runSequentialServerReads } from "./server-read-scheduling.ts";

test("CloudBase scheduling finishes one authenticated read before starting the next", async () => {
  const events: string[] = [];
  let finishFirst: (() => void) | undefined;
  const first = () =>
    new Promise<string>((resolve) => {
      events.push("first:start");
      finishFirst = () => {
        events.push("first:end");
        resolve("first");
      };
    });
  const second = async () => {
    events.push("second:start");
    return "second";
  };

  const pending = runSequentialServerReads([first, second]);
  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  finishFirst?.();
  assert.deepEqual(await pending, ["first", "second"]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("Supabase scheduling retains parallel reads", async () => {
  const events: string[] = [];
  let finishFirst: (() => void) | undefined;
  const pending = runParallelServerReads([
    () =>
      new Promise<string>((resolve) => {
        events.push("first:start");
        finishFirst = () => resolve("first");
      }),
    async () => {
      events.push("second:start");
      return "second";
    },
  ]);
  await Promise.resolve();
  assert.deepEqual(events, ["first:start", "second:start"]);
  finishFirst?.();
  assert.deepEqual(await pending, ["first", "second"]);
});
