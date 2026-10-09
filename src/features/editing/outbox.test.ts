import assert from "node:assert/strict";
import { test } from "node:test";
import { DurableOutbox, SyncFailure, type OutboxOperation } from "./outbox.ts";

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("a corrupted operation discovered after restore is retained and never sent or overwritten", async () => {
  const storage = memory();
  let online = false,
    sent = 0;
  const queue = new DurableOutbox(
    "q",
    storage,
    (op) => op.intent,
    async (wire) => {
      sent++;
      return wire;
    },
    () => {},
    () => online,
  );
  queue.enqueue("A", ["day"], { title: "A" });
  storage.setItem("q:A", "{corrupt saved bytes");
  online = true;
  await queue.pump();
  await settle();
  assert.equal(sent, 0);
  assert.equal(storage.getItem("q:A"), "{corrupt saved bytes");
  assert.match(queue.storageError ?? "", /could not be recovered/);
});

test("domain validation rejects damaged frozen wire before dispatch and keeps its recovery bytes", () => {
  const storage = memory();
  const queue = new DurableOutbox(
    "q",
    storage,
    (op) => op.intent,
    async (wire) => wire,
    () => {},
    () => false,
  );
  queue.enqueue("A", ["day"], { title: "A" });
  const row = JSON.parse(storage.getItem("q:A")!);
  row.wire = { title: 42 };
  storage.setItem("q:A", JSON.stringify(row));
  const bytes = storage.getItem("q:A");
  const restored = new DurableOutbox(
    "q",
    storage,
    (op) => op.intent,
    async (wire) => wire,
    () => {},
    () => false,
    (_name, run) => run(),
    (value) => {
      if (typeof (value as { title?: unknown }).title !== "string")
        throw new Error("invalid title");
    },
  );
  assert.match(restored.storageError ?? "", /invalid title/);
  assert.equal(storage.getItem("q:A"), bytes);
});

test("acceptance is durable before send, and offline reload preserves intent", async () => {
  const storage = memory();
  let sent = 0;
  const queue = new DurableOutbox(
    "A",
    storage,
    (op) => op.intent,
    async (wire) => {
      sent++;
      return wire;
    },
    () => {},
    () => false,
  );
  queue.enqueue("create", ["day"], { title: "new" });
  assert.equal(sent, 0);
  assert.equal(JSON.parse(storage.getItem("A:create")!).status, "queued");
  const resumed = new DurableOutbox(
    "A",
    storage,
    (op) => op.intent,
    async (wire) => {
      sent++;
      return wire;
    },
    () => {},
  );
  await resumed.pump();
  await settle();
  assert.equal(sent, 1);
  assert.equal(resumed.operations[0].status, "acknowledged");
});

test("same-day writes serialize while independent days can progress", async () => {
  const calls: string[] = [],
    wait = deferred<OutboxOperation["intent"]>();
  const queue = new DurableOutbox(
    "q",
    memory(),
    (op) => ({ id: op.id }),
    async (wire) => {
      const id = (wire as { id: string }).id;
      calls.push(id);
      return id === "A" ? wait.promise : wire;
    },
    () => {},
  );
  queue.enqueue("A", ["day1"], {});
  queue.enqueue("B", ["day1"], {});
  queue.enqueue("C", ["day2"], {});
  await settle();
  assert.deepEqual(calls, ["A", "C"]);
  wait.resolve({});
  await settle();
  await settle();
  assert.deepEqual(calls, ["A", "C", "B"]);
});

test("failed A leaves independent B acknowledged and keeps A recoverable", async () => {
  const queue = new DurableOutbox(
    "q",
    memory(),
    (op) => op.intent,
    async (wire) => {
      if ((wire as { fail?: boolean }).fail) throw new Error("503");
      return wire;
    },
    () => {},
  );
  queue.enqueue("A", ["day1"], { fail: true });
  queue.enqueue("B", ["day2"], { title: "B" });
  await settle();
  assert.equal(queue.operations[0].status, "failed");
  assert.equal(queue.operations[1].status, "acknowledged");
  assert.deepEqual(queue.operations[1].ack, { title: "B" });
});

test("response loss replays exact wire and operation ID even after reload", async () => {
  const storage = memory();
  let prepares = 0;
  const received: unknown[] = [];
  const committed = new Set<string>();
  const prepare = (op: OutboxOperation) => {
    prepares++;
    return { id: op.id, version: prepares };
  };
  const send = async (wire: OutboxOperation["intent"]) => {
    received.push(structuredClone(wire));
    committed.add((wire as { id: string }).id);
    if (received.length === 1) throw new Error("ACK lost");
    return { id: "entity" };
  };
  const queue = new DurableOutbox("q", storage, prepare, send, () => {});
  queue.enqueue("stable", ["day"], {});
  await settle();
  const resumed = new DurableOutbox("q", storage, prepare, send, () => {});
  resumed.retry("stable");
  await settle();
  assert.equal(prepares, 1);
  assert.deepEqual(received[0], received[1]);
  assert.equal(committed.size, 1);
});

test("create/edit/delete dependencies survive restart and preserve order", async () => {
  const storage = memory(),
    calls: string[] = [];
  const offline = new DurableOutbox(
    "q",
    storage,
    (op) => op.id,
    async (wire) => wire,
    () => {},
    () => false,
  );
  offline.enqueue("create", ["day"], {});
  offline.enqueue("edit", ["day"], {}, ["create"]);
  offline.enqueue("delete", ["day"], {}, ["edit"]);
  const restored = new DurableOutbox(
    "q",
    storage,
    (op) => op.id,
    async (wire) => {
      calls.push(String(wire));
      return wire;
    },
    () => {},
  );
  await restored.pump();
  for (let index = 0; index < 5; index++) await settle();
  assert.deepEqual(calls, ["create", "edit", "delete"]);
});

test("401/403/404/409/5xx stop without automatic loops", async () => {
  for (const status of [401, 403, 404, 409, 500, 503]) {
    let attempts = 0;
    const queue = new DurableOutbox(
      "q",
      memory(),
      (op) => op.intent,
      async () => {
        attempts++;
        throw new SyncFailure(String(status), status === 409 ? "conflict" : "failed");
      },
      () => {},
    );
    queue.enqueue("A", ["day"], {});
    await settle();
    await queue.pump();
    await settle();
    assert.equal(attempts, 1);
    assert.equal(queue.operations[0].status, status === 409 ? "conflict" : "failed");
  }
});

test("failed dependency blocks only dependent intent", async () => {
  const calls: string[] = [];
  const queue = new DurableOutbox(
    "q",
    memory(),
    (op) => op.id,
    async (wire) => {
      calls.push(String(wire));
      if (wire === "A") throw new SyncFailure("conflict", "conflict");
      return wire;
    },
    () => {},
  );
  queue.enqueue("A", ["day"], {});
  queue.enqueue("dependent", ["day"], {}, ["A"]);
  queue.enqueue("independent", ["day"], {});
  await settle();
  await settle();
  assert.deepEqual(calls, ["A", "independent"]);
});

test("immutable IDs reject different payloads and storage failure rejects acceptance", () => {
  const storage = memory(),
    queue = new DurableOutbox(
      "q",
      storage,
      (op) => op.intent,
      async (wire) => wire,
      () => {},
      () => false,
    );
  queue.enqueue("A", ["day"], { title: "A" });
  assert.throws(() => queue.enqueue("A", ["day"], { title: "B" }), /reused/);
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.throws(() => queue.enqueue("B", ["day"], {}), /quota/);
  assert.equal(queue.operations.length, 1);
  assert.equal(queue.storageError, "quota");
});

test("deactivation prevents an old account from dispatching further work", async () => {
  const wait = deferred<OutboxOperation["intent"]>(),
    calls: string[] = [];
  const queue = new DurableOutbox(
    "A",
    memory(),
    (op) => op.id,
    async (wire) => {
      calls.push(String(wire));
      return wait.promise;
    },
    () => {},
  );
  queue.enqueue("first", ["day"], {});
  queue.enqueue("later", ["day"], {});
  await settle();
  queue.setEnabled(false);
  wait.resolve({});
  await settle();
  assert.deepEqual(calls, ["first"]);
  const other = new DurableOutbox(
    "B",
    memory(),
    (op) => op.id,
    async (wire) => wire,
    () => {},
  );
  assert.equal(other.operations.length, 0);
});

test("another tab's dependent operation survives ACK compaction", async () => {
  const storage = memory();
  const a = new DurableOutbox(
    "q",
    storage,
    (op) => op.intent,
    async (wire) => wire,
    () => {},
  );
  a.enqueue("parent", ["day"], {});
  await settle();
  const b = new DurableOutbox(
    "q",
    storage,
    (op) => op.id,
    async (wire) => wire,
    () => {},
    () => false,
  );
  b.enqueue("child", ["day"], {}, ["parent"]);
  a.compactAcknowledged();
  const calls: string[] = [];
  const restored = new DurableOutbox(
    "q",
    storage,
    (op) => op.id,
    async (wire) => {
      calls.push(String(wire));
      return wire;
    },
    () => {},
  );
  await restored.pump();
  await settle();
  assert.deepEqual(calls, ["child"]);
  assert.equal(storage.getItem("q-receipt:parent"), "1");
});

test("manual resolution archives exactly the dependent branch and preserves recoverable bytes", () => {
  const storage = memory(),
    queue = new DurableOutbox(
      "q",
      storage,
      (op) => op.intent,
      async (wire) => wire,
      () => {},
      () => false,
    );
  queue.enqueue("A", ["day"], { title: "A" });
  queue.enqueue("B", ["day"], { title: "B" }, ["A"]);
  queue.enqueue("C", ["other"], { title: "C" });
  queue.archiveBranch("A");
  assert.deepEqual(
    queue.operations.map((op) => op.id),
    ["C"],
  );
  assert.equal(JSON.parse(storage.getItem("q-archive:B")!).intent.title, "B");
});

test("checkpoint failure retains the ACK and restores it without sending again", async () => {
  const storage = memory(),
    committed = new Set(),
    wires: unknown[] = [];
  let checkpointFails = true;
  const queue = new DurableOutbox(
    "q",
    storage,
    (op) => ({ id: op.id, version: 1 }),
    async (wire) => {
      wires.push(wire);
      committed.add((wire as { id: string }).id);
      return { id: "saved" };
    },
    () => {
      if (checkpointFails) throw new Error("checkpoint quota");
    },
  );
  queue.enqueue("A", ["day"], {});
  await settle();
  assert.equal(queue.operations[0].status, "failed");
  assert.deepEqual(queue.operations[0].ack, { id: "saved" });
  checkpointFails = false;
  queue.retry("A");
  await settle();
  assert.equal(committed.size, 1);
  assert.deepEqual(wires, [{ id: "A", version: 1 }]);
  assert.equal(queue.operations[0].status, "acknowledged");
});

test("a task waits for another durable queue's receipt after refresh", async () => {
  const storage = memory(),
    calls: string[] = [];
  const queue = new DurableOutbox(
    "route",
    storage,
    (op) => op.id,
    async (wire) => {
      calls.push(String(wire));
      return wire;
    },
    () => {},
    () => true,
    (_name, action) => action(),
    () => {},
    (id) => storage.getItem(`planner-receipt:${id}`) === "1",
  );
  queue.enqueue("route-task", ["day"], {}, ["new-item"]);
  await settle();
  assert.deepEqual(calls, []);
  storage.setItem("planner-receipt:new-item", "1");
  await queue.pump();
  await settle();
  assert.deepEqual(calls, ["route-task"]);
});

test("an interrupted paid task requires an explicit retry with its original payload", async () => {
  const storage = memory();
  storage.setItem(
    "route:A",
    JSON.stringify({
      id: "A",
      createdAt: 1,
      resources: ["day"],
      dependsOn: [],
      intent: { mode: "walk" },
      wire: { mode: "walk", version: 2 },
      status: "sending",
      attempts: 1,
    }),
  );
  const wires: unknown[] = [];
  const queue = new DurableOutbox(
    "route",
    storage,
    () => {
      throw new Error("Frozen input must not be prepared again");
    },
    async (wire) => {
      wires.push(wire);
      return {};
    },
    () => {},
  );
  queue.requireManualReplay("Interrupted calculation");
  await queue.pump();
  await settle();
  assert.deepEqual(wires, []);
  assert.equal(queue.operations[0].status, "failed");
  queue.retry("A");
  await settle();
  assert.deepEqual(wires, [{ mode: "walk", version: 2 }]);
});
