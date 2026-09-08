import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createGuestTripDraft } from "./defaults.ts";
import { GuestDraftMutations } from "./mutations.ts";
import { guestTripDraftSchema, migrateGuestTripDraft } from "./schema.ts";
import {
  GuestDraftStorage,
  GuestStorageError,
  guestDraftStorageKey,
  guestImportMarkerStorageKey,
  guestIntentStorageKey,
} from "./storage.ts";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException("full", "QuotaExceededError");
    this.values.set(key, value);
  }
}

function ids(start = 0) {
  let value = start;
  return () => {
    value += 1;
    return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  };
}

function draft(region: "cn" | "global" = "global", idStart = 0) {
  return createGuestTripDraft(region, "UTC", new Date("2026-09-05T12:00:00.000Z"), ids(idStart));
}

test("guest drafts are region-isolated, versioned, and runtime validated", () => {
  const value = draft();
  assert.equal(guestTripDraftSchema.parse(value).schemaVersion, 1);
  assert.notEqual(guestDraftStorageKey("global"), guestDraftStorageKey("cn"));
  const legacy = { ...value, revision: undefined, schemaVersion: 0 };
  assert.equal(migrateGuestTripDraft(legacy).revision, 0);
  assert.throws(
    () => migrateGuestTripDraft({ ...value, schemaVersion: 99 }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "incompatible",
  );
});

test("guest storage restores one active draft and refuses a stale tab overwrite", () => {
  const memory = new MemoryStorage();
  const storage = new GuestDraftStorage("global", memory as Storage);
  const original = draft();
  storage.probe();
  storage.save(original, null);
  assert.deepEqual(storage.load(), original);
  const current = { ...original, revision: 1 };
  storage.save(current, 0);
  assert.throws(
    () => storage.save({ ...original, revision: 1 }, 0),
    (error: unknown) => error instanceof GuestStorageError && error.code === "conflict",
  );
  assert.throws(
    () => storage.save(draft("global", 50), null),
    (error: unknown) => error instanceof GuestStorageError && error.code === "conflict",
  );
});

test("guest storage reports quota and preserves corrupt recovery data", () => {
  const memory = new MemoryStorage();
  const storage = new GuestDraftStorage("global", memory as Storage);
  memory.values.set(guestDraftStorageKey("global"), "{broken");
  assert.throws(
    () => storage.load(),
    (error: unknown) =>
      error instanceof GuestStorageError && error.code === "corrupt" && error.raw === "{broken",
  );
  memory.values.clear();
  memory.failWrites = true;
  assert.throws(
    () => storage.probe(),
    (error: unknown) => error instanceof GuestStorageError && error.code === "quota",
  );
  const unavailable = new GuestDraftStorage("global", {
    setItem() {
      throw new DOMException("denied", "SecurityError");
    },
  } as unknown as Storage);
  assert.throws(
    () => unavailable.probe(),
    (error: unknown) => error instanceof GuestStorageError && error.code === "unavailable",
  );
});

test("guest intent cleanup and imported markers preserve a recoverable continuation", () => {
  const memory = new MemoryStorage();
  const storage = new GuestDraftStorage("global", memory as Storage);
  const value = draft();
  const itemId = ids(900)();
  const intent = {
    action: "attachment" as const,
    createdAt: value.createdAt,
    draftId: value.draftId,
    itemId,
  };
  storage.save(value, null);
  storage.writeIntent(intent);
  storage.clearIntent(ids(950)());
  assert.deepEqual(storage.readIntent(), intent);
  storage.writeImportMarker({
    draftId: value.draftId,
    importedAt: value.updatedAt,
    intent,
    tripId: ids(1000)(),
  });
  assert.equal(storage.readImportMarker()?.intent?.itemId, itemId);
  storage.clear(value.draftId);
  assert.equal(memory.getItem(guestDraftStorageKey("global")), null);
  assert.equal(memory.getItem(guestIntentStorageKey("global")), null);
  assert.notEqual(memory.getItem(guestImportMarkerStorageKey("global")), null);
  storage.clearAll();
  assert.equal(memory.getItem(guestImportMarkerStorageKey("global")), null);
});

test("guest item and day mutations stay local and preserve importable identifiers", async () => {
  let current = draft();
  const commit = (update: (value: typeof current) => typeof current) => {
    current = update(current);
    return current;
  };
  const local = new GuestDraftMutations(
    commit,
    ids(100),
    () => new Date("2026-09-05T12:30:00.000Z"),
  );
  const tripId = current.draftId;
  const variantId = current.workspace.variant.id;
  const dayId = current.workspace.days[0].id;
  const item = await local.createItem({
    dayId,
    details: { location: "Kyoto" },
    expectedItemsVersion: 1,
    operationId: "00000000-0000-4000-8000-000000000999",
    placeSnapshot: {
      coordinateSystem: "wgs84",
      displayName: "Kiyomizu-dera",
      latitude: 34.9948,
      longitude: 135.785,
      localityKind: "locality",
      localityName: "Kyoto",
      localitySource: "google_address_component",
      provider: "google",
      providerPlaceId: "google-place-1",
    },
    title: "Kiyomizu-dera",
    tripId,
    type: "activity",
    variantId,
  });
  assert.equal(current.workspace.days[0].items[0].id, item.id);
  assert.equal(current.trip.title, "Kyoto Trip");
  await local.insertDay({
    beforeDayNumber: 2,
    expectedDaysVersion: 1,
    operationId: "00000000-0000-4000-8000-000000000174",
    tripId,
    variantId,
  });
  assert.equal(current.workspace.days.length, 2);
  const copied = await local.copyItems({
    expectedItemsVersion: 1,
    operationId: "00000000-0000-4000-8000-000000000176",
    sourceItemIds: [item.id],
    sourceVersions: [item.version],
    targetDayId: current.workspace.days[1].id,
    tripId,
    variantId,
  });
  assert.notEqual(copied[0].id, item.id);
  assert.equal(copied[0].place_id, item.place_id);
  await local.deleteItem({
    expectedItemsVersion: 1,
    expectedVersion: item.version,
    id: item.id,
    operationId: "00000000-0000-4000-8000-000000000998",
    tripId,
    variantId,
  });
  assert.equal(current.workspace.days[0].items.length, 0);
  assert.equal(guestTripDraftSchema.safeParse(current).success, true);
});

test("guest import migration is authenticated, bounded, idempotent, and never grants anon", () => {
  const sql = readFileSync(
    new URL(
      "../../../database/shared/migrations/20260905040000_guest_trip_import.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /SECURITY DEFINER[\s\S]*SET search_path = ''/);
  assert.match(sql, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(
    readFileSync(
      new URL(
        "../../../database/cloudbase/overlays/migrations/20260905040000_guest_trip_import.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    /app_private\.app_current_user_id\(\)/,
  );
  assert.match(sql, /octet_length\(guest_payload::text\) > 2097152/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.import_guest_trip_v1\(uuid, jsonb, text\) FROM PUBLIC, anon/,
  );
  assert.doesNotMatch(sql, /GRANT EXECUTE[^;]+ TO anon/);
});

test("guest import reuses provider identity when local drafts repeat a place", () => {
  const sql = readFileSync(
    new URL(
      "../../../database/shared/migrations/20260906010000_guest_trip_import_place_dedup.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /Guest import place block was not recognized/);
  assert.match(
    sql,
    /ON CONFLICT \(trip_id, source, provider_place_id\)[\s\S]*WHERE provider_place_id IS NOT NULL/,
  );
  assert.match(sql, /RETURNING id INTO item_place_id/);
  assert.match(sql, /'legacy_city'/);
});

test("landing and post-login flows route the browser-held draft without serializing it", () => {
  const landingRoute = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  const landing = readFileSync(new URL("../landing/landing-page.tsx", import.meta.url), "utf8");
  const guestRoute = readFileSync(new URL("../../app/guest/page.tsx", import.meta.url), "utf8");
  const refresh = readFileSync(
    new URL("../auth/components/post-login-refresh.tsx", import.meta.url),
    "utf8",
  );
  assert.match(landingRoute, /<LandingPage/);
  assert.match(landingRoute, /getCurrentUser/);
  assert.match(landing, /accountLabel \? "\/trips" : "\/guest"/);
  assert.match(guestRoute, /if \(user\) redirect\("\/trips"\)/);
  assert.match(refresh, /await claimGuestTrip\(draft\)/);
  assert.match(refresh, /if \(!result\.data\)[\s\S]*clearAll\(\)/);
  assert.doesNotMatch(refresh, /\/guest\?claim=/);
  assert.doesNotMatch(refresh, /JSON\.stringify/);
});

test("guest persistence core is import-safe without browser globals", () => {
  assert.equal(typeof window, "undefined");
  assert.equal(typeof GuestDraftStorage, "function");
});
