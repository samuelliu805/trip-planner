import assert from "node:assert/strict";
import test from "node:test";

import type { PlannerVariant } from "../itinerary/types.ts";
import {
  buildDeleteVariantInput,
  findRefreshedDeleteVariant,
  resolveManageVariantReload,
  resolveDeleteVariantReload,
} from "../variants/delete-variant-reload.ts";
import { refetchRouteVariantList } from "../variants/variant-list-reload.ts";
import {
  completedTripDeleteReload,
  effectiveTripDeleteSnapshot,
  openedTripDeleteSession,
  startedTripDeleteSubmission,
  type TripDeleteSnapshot,
} from "./delete-trip-reload.ts";

function variant(overrides: Partial<PlannerVariant> = {}): PlannerVariant {
  return {
    color: "#2563eb",
    content_version: 1,
    days_version: 1,
    id: "variant-1",
    is_primary: false,
    items_version: 1,
    name: "Alternate",
    trip_id: "trip-1",
    version: 1,
    ...overrides,
  };
}

test("Plan deletion retries with every token from the refreshed V2 entity", async () => {
  const calls: ReturnType<typeof buildDeleteVariantInput>[] = [];
  const v1 = variant();
  const v2 = variant({
    content_version: 22,
    days_version: 23,
    items_version: 24,
    name: "Alternate V2",
    version: 21,
  });
  let deleteTarget = v1;

  async function deleteVariant() {
    const input = buildDeleteVariantInput("trip-1", deleteTarget, `operation-${calls.length + 1}`);
    calls.push(input);
    if (calls.length === 1) throw Object.assign(new Error("Plan changed"), { code: "conflict" });
    return { success: true };
  }

  await assert.rejects(deleteVariant, { code: "conflict" });
  deleteTarget = findRefreshedDeleteVariant([v2], deleteTarget.id)!;
  await deleteVariant();

  assert.deepEqual(calls[0], {
    expectedContentVersion: 1,
    expectedDaysVersion: 1,
    expectedItemsVersion: 1,
    expectedVersion: 1,
    operationId: "operation-1",
    tripId: "trip-1",
    variantId: "variant-1",
  });
  assert.deepEqual(calls[1], {
    expectedContentVersion: 22,
    expectedDaysVersion: 23,
    expectedItemsVersion: 24,
    expectedVersion: 21,
    operationId: "operation-2",
    tripId: "trip-1",
    variantId: "variant-1",
  });
});

test("Plan deletion reload reports an entity deleted by another user", () => {
  const outcome = resolveDeleteVariantReload([variant({ id: "variant-2" })], "variant-1");
  assert.equal(outcome.refreshedVariant, undefined);
  assert.equal(outcome.notice, "That Plan was already deleted. The latest Plans are now visible.");
});

test("Set Primary conflict reloads the exact Plan list once and retries with V2", async () => {
  const v1 = variant({ version: 1 });
  const v2 = variant({ name: "Alternate V2", version: 2 });
  const submittedVersions: number[] = [];
  const refetches: unknown[] = [];
  let cachedVariants = [v1];
  const dialogOpen = true;
  let conflict = false;
  let error: string | undefined;

  async function setPrimary(target: PlannerVariant) {
    submittedVersions.push(target.version);
    if (target.version === 1) {
      throw Object.assign(new Error("Plan version conflict"), { code: "conflict" as const });
    }
  }

  await assert.rejects(setPrimary(v1), {
    code: "conflict",
    message: "Plan version conflict",
  });
  conflict = true;
  error = "Plan version conflict";

  const latest = await refetchRouteVariantList(
    {
      getQueryData: <T>() => cachedVariants as T,
      refetchQueries: async (filters) => {
        refetches.push(filters);
        cachedVariants = [v2];
      },
    },
    "trip-1",
  );
  const reload = resolveManageVariantReload(latest, undefined);
  const notice = reload.notice;
  conflict = false;
  error = undefined;

  assert.deepEqual(refetches, [
    { exact: true, queryKey: ["planner-variants", "trip-1"], type: "active" },
  ]);
  assert.equal(error, undefined);
  assert.equal(conflict, false);
  assert.equal(notice, "Latest Plans loaded. You can retry setting the primary Plan.");
  assert.equal(dialogOpen, true);

  await setPrimary(latest![0]);
  assert.deepEqual(submittedVersions, [1, 2]);
});

test("Trip deletion reload hides the stale error and submits refreshed hidden versions", () => {
  const initial: TripDeleteSnapshot = {
    activeSharePageCount: 1,
    contentVersion: 3,
    version: 2,
  };
  const refreshed: TripDeleteSnapshot = {
    activeSharePageCount: 4,
    contentVersion: 13,
    version: 12,
  };
  const conflictState = { conflict: true, error: "Trip changed" };

  const latest = effectiveTripDeleteSnapshot(initial, refreshed);
  let reloadState = completedTripDeleteReload(refreshed, conflictState);

  const submittedHiddenVersions = {
    expected_content_version: latest.contentVersion,
    expected_version: latest.version,
  };
  assert.equal(conflictState === reloadState.hiddenErrorState, true);
  assert.equal(reloadState.reloadSucceeded, true);
  assert.equal(latest.activeSharePageCount, 4);
  assert.deepEqual(submittedHiddenVersions, {
    expected_content_version: 13,
    expected_version: 12,
  });

  reloadState = startedTripDeleteSubmission(reloadState);
  assert.equal(reloadState.reloadSucceeded, false, "a new delete submission clears reload success");
  assert.equal(
    reloadState.hiddenErrorState,
    conflictState,
    "the stale error stays hidden on retry",
  );
});

test("Trip deletion reload preserves initial values until a snapshot is available", () => {
  const initial: TripDeleteSnapshot = {
    activeSharePageCount: null,
    contentVersion: 7,
    version: 6,
  };
  assert.equal(effectiveTripDeleteSnapshot(initial, null), initial);
});

test("Trip deletion starts each open session without stale action or reload state", () => {
  const staleConflict = { conflict: true, error: "Trip version conflict" };
  const reopened = openedTripDeleteSession(staleConflict);

  assert.equal(reopened.hiddenErrorState, staleConflict);
  assert.equal(reopened.latestSnapshot, null);
  assert.equal(reopened.reloadSucceeded, false);
  assert.equal(staleConflict === reopened.hiddenErrorState, true, "the old error is hidden");

  const currentSessionError = { conflict: false, error: "Current session action failed" };
  assert.equal(
    currentSessionError === reopened.hiddenErrorState,
    false,
    "a new action error remains visible",
  );
});
