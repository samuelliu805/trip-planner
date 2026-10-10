import assert from "node:assert/strict";
import { test } from "node:test";
import { claimCurrentGuestDraft, transferGuestEditorDrafts } from "./claim-continuation.ts";
import { GuestDraftStorage } from "./storage.ts";
import { createGuestTripDraft } from "./defaults.ts";

test("a slow claim confirms its cutoff and then transfers the later revision before cleanup", async () => {
  let draft = createGuestTripDraft("global", "UTC");
  const calls: number[] = [],
    deleted: number[] = [];
  const result = await claimCurrentGuestDraft({
    getCurrent: () => draft,
    flush: () => true,
    send: async (snapshot) => {
      calls.push(snapshot.revision);
      if (calls.length === 1) draft = { ...draft, revision: draft.revision + 1 };
      return { data: { tripId: "stable" } };
    },
    complete: (snapshot) => {
      deleted.push(snapshot.revision);
      return true;
    },
  });
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(deleted, [1]);
  assert.equal(result.tripId, "stable");
});
test("failed continuation and local storage failures leave the unique draft intact", async () => {
  const draft = createGuestTripDraft("global", "UTC");
  let removed = false,
    sent = false;
  await assert.rejects(
    claimCurrentGuestDraft({
      getCurrent: () => draft,
      flush: () => false,
      send: async () => {
        sent = true;
        return { data: {} };
      },
      complete: () => {
        removed = true;
        return true;
      },
    }),
  );
  assert.equal(sent, false);
  assert.equal(removed, false);
  await assert.rejects(
    claimCurrentGuestDraft({
      getCurrent: () => draft,
      flush: () => true,
      send: async () => ({ error: "403" }),
      complete: () => {
        removed = true;
        return true;
      },
    }),
    /403/,
  );
  assert.equal(removed, false);
});
test("another tab's newer stored revision cannot be cleared by a successful old ACK", async () => {
  const draft = createGuestTripDraft("global", "UTC");
  await assert.rejects(
    claimCurrentGuestDraft({
      getCurrent: () => draft,
      flush: () => true,
      send: async () => ({ data: {} }),
      complete: () => false,
    }),
    /another tab/,
  );
});
test("claim transfers unfinished editor drafts without overwriting an account draft or deleting the Guest copy", () => {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index],
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  } as Storage;
  const source = 'trip-planner:editing:v1:["global","guest","draft","plan","new:meal"]';
  const destination = 'trip-planner:editing:v1:["global","actor","trip","plan","new:meal"]';
  storage.setItem(source, '{"values":{"notes":"未提交尾部"}}');
  transferGuestEditorDrafts(storage, "draft", "trip", "actor");
  assert.equal(storage.getItem(destination), storage.getItem(source));
  assert.ok(storage.getItem(source));
  storage.setItem(destination, "account input");
  assert.throws(
    () => transferGuestEditorDrafts(storage, "draft", "trip", "actor"),
    /account draft/,
  );
  assert.equal(storage.getItem(destination), "account input");
});
test("Guest cleanup compares the exact stored revision even after a claim succeeded", () => {
  const data = new Map<string, string>();
  const browser = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  } as Storage;
  const store = new GuestDraftStorage("global", browser),
    draft = createGuestTripDraft("global", "UTC");
  store.save({ ...draft, revision: 2 }, null);
  assert.equal(store.clear(draft.draftId, 1), false);
  assert.equal(store.load()?.revision, 2);
  assert.equal(store.clear(draft.draftId, 2), true);
  assert.equal(store.load(), null);
});
