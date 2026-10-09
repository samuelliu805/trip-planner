import assert from "node:assert/strict";
import { test } from "node:test";
import { DurableOutbox } from "./outbox.ts";
import { archiveSyncBranch } from "./archive-sync-branch.ts";

test("discard archives a cross-domain dependent branch and leaves independent work intact", () => {
  const records = new Map<string, string>();
  const storage = {
    get length() {
      return records.size;
    },
    key: (index: number) => [...records.keys()][index] ?? null,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
    removeItem: (key: string) => {
      records.delete(key);
    },
    clear: () => records.clear(),
  };
  const queue = (prefix: string) =>
    new DurableOutbox(
      prefix,
      storage,
      (op) => op.intent,
      async (wire) => wire,
      () => {},
      () => false,
    );
  const plans = { scope: ["global", "account", "trip", "variants"], queue: queue("plans") };
  const items = { scope: ["global", "account", "trip", "new-plan"], queue: queue("items") };
  const routes = { scope: ["global", "account", "trip", "new-plan"], queue: queue("routes") };
  plans.queue.enqueue("new-plan", ["*"], { name: "New Plan" });
  items.queue.enqueue("new-item", ["day"], { title: "Chinese 尾部" }, ["new-plan"]);
  items.queue.enqueue("independent", ["other-day"], { title: "Keep" });
  routes.queue.enqueue("calculate", ["day"], { mode: "walk" }, ["new-item"]);
  archiveSyncBranch([plans, items, routes], plans, "new-plan");
  assert.equal(plans.queue.operations.length, 0);
  assert.equal(routes.queue.operations.length, 0);
  assert.deepEqual(
    items.queue.operations.map((op) => op.id),
    ["independent"],
  );
  assert.equal(JSON.parse(storage.getItem("items-archive:new-item")!).intent.title, "Chinese 尾部");
  assert.equal(
    storage.getItem("plans-receipt:new-plan"),
    null,
    "discard must not pretend the parent committed",
  );
});
