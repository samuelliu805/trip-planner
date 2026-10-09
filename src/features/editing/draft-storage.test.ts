import assert from "node:assert/strict";
import { test } from "node:test";
import { DraftStorage, editingStorageKey } from "./draft-storage.ts";

function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test("incomplete drafts and final IME text survive reload without creating an entity", () => {
  const storage = memory();
  const key = editingStorageKey(["global", "guest", "trip", "plan"], "new:day:activity");
  const saved = new DraftStorage(storage).write(
    key,
    { title: "", notes: "中文输入，粘贴\n尾部", links: [{ url: "half" }] },
    null,
  );
  assert.equal(saved.revision, 1);
  assert.deepEqual(new DraftStorage(storage).read(key), saved);
});

test("account, region, trip and entity scopes never collide", () => {
  const keys = [
    ["global", "A", "trip", "plan"],
    ["global", "B", "trip", "plan"],
    ["cn", "A", "trip", "plan"],
    ["global", "A", "other", "plan"],
  ].map((scope) => editingStorageKey(scope, "item"));
  assert.equal(new Set(keys).size, 4);
  assert.notEqual(editingStorageKey(["a:b", "c"], "d"), editingStorageKey(["a", "b:c"], "d"));
});

test("a stale tab cannot overwrite or discard a newer draft", () => {
  const storage = memory(),
    first = new DraftStorage(storage),
    second = new DraftStorage(storage);
  first.write("draft", { title: "A" }, null);
  second.write("draft", { title: "B" }, 1);
  assert.throws(() => first.write("draft", { title: "C" }, 1), /another tab/);
  assert.throws(() => first.discard("draft", 1), /another tab/);
  assert.equal(second.read("draft")?.values.title, "B");
});

test("corruption and incompatible schemas preserve the recoverable bytes", () => {
  for (const raw of ["{broken", JSON.stringify({ schema: 2, revision: 1, values: {} })]) {
    const storage = memory();
    storage.setItem("draft", raw);
    assert.throws(() => new DraftStorage(storage).write("draft", { title: "new" }, null));
    assert.equal(storage.getItem("draft"), raw);
  }
});

test("quota failure never reports a durable revision", () => {
  const storage = memory();
  storage.setItem = () => {
    throw new DOMException("Full", "QuotaExceededError");
  };
  assert.throws(
    () => new DraftStorage(storage).write("draft", { title: "kept by caller" }, null),
    /Full/,
  );
  assert.equal(storage.getItem("draft"), null);
});

test("each tab retains its own recovery input after losing a canonical revision", () => {
  const storage = memory(),
    a = new DraftStorage(storage, "tab-a"),
    b = new DraftStorage(storage, "tab-b");
  a.write("draft", { title: "A" }, null);
  b.write("draft", { title: "B" }, 1);
  assert.throws(() => a.write("draft", { title: "A tail" }, 1), /another tab/);
  assert.equal(b.read("draft")?.values.title, "B");
  assert.equal(new DraftStorage(storage, "tab-a").readRecovery("draft")?.values.title, "A tail");
  assert.equal(new DraftStorage(storage, "tab-b").readRecovery("draft")?.values.title, "B");
});
