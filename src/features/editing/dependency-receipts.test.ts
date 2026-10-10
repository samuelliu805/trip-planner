import assert from "node:assert/strict";
import { test } from "node:test";
import { hasScopeReceipt } from "./dependency-receipts.ts";

test("a durable receipt releases another domain only in the same region, account and trip", () => {
  const scope = ["global", "A", "trip", "variants"];
  const key = `trip-planner:actions-outbox:v1:${JSON.stringify(scope)}-receipt:parent`;
  const data = new Map([
    [key, "1"],
    ["trip-planner:outbox:v1:[broken]-receipt:parent", "1"],
  ]);
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
  } as Storage;
  assert.equal(hasScopeReceipt(storage, ["global", "A", "trip", "child"], "parent"), true);
  for (const other of [
    ["cn", "A", "trip"],
    ["global", "B", "trip"],
    ["global", "A", "other"],
  ])
    assert.equal(hasScopeReceipt(storage, other, "parent"), false);
  data.set(key, "0");
  assert.equal(hasScopeReceipt(storage, scope, "parent"), false);
  assert.equal(data.get("trip-planner:outbox:v1:[broken]-receipt:parent"), "1");
});
