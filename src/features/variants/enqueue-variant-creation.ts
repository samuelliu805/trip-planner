import type { QueryClient } from "@tanstack/react-query";
import { ownedPlannerRuntime } from "../itinerary/planner-runtime-owner";
import type { PlannerWorkspace } from "../itinerary/types";
import type { VariantSyncRuntime } from "./variant-sync-runtime";

/** Server reads must not discard accepted source edits when creating a Plan. */
export function captureOwnedVariantSource(
  scope: string[],
  client: QueryClient,
  snapshot: PlannerWorkspace,
  sourceVariantId = snapshot.variant.id,
) {
  if (snapshot.variant.id !== sourceVariantId)
    throw new Error("Load the selected source Plan before creating it. Your draft is kept.");
  // Query data can already be this owner's projection, never a confirmed baseline.
  return ownedPlannerRuntime([...scope.slice(0, 3), sourceVariantId], client, snapshot).project();
}

/** Only a completed server read may reconcile a source owner's confirmed state. */
export function reconcileOwnedVariantSource(
  scope: string[],
  client: QueryClient,
  snapshot: PlannerWorkspace,
) {
  return ownedPlannerRuntime([...scope.slice(0, 3), snapshot.variant.id], client, snapshot, {
    confirmedRead: true,
  }).project();
}

export function enqueueVariantCreation(
  runtime: VariantSyncRuntime,
  client: QueryClient,
  snapshot: PlannerWorkspace,
  options: {
    duplicate: boolean;
    sourceVariantId: string;
    name: string;
    color: string;
    operationId: string;
  },
) {
  const source = captureOwnedVariantSource(
    runtime.scope,
    client,
    snapshot,
    options.sourceVariantId,
  );
  return runtime.accept({
    kind: "create",
    duplicate: options.duplicate,
    source,
    input: {
      tripId: runtime.scope[2],
      sourceVariantId: source.variant.id,
      operationId: options.operationId,
      color: options.color,
      name: options.name,
      expectedSourceVersion: source.variant.version,
      expectedSourceContentVersion: source.variant.content_version,
      expectedSourceDaysVersion: source.variant.days_version,
      expectedSourceItemsVersion: source.variant.items_version,
      dayIds: Object.fromEntries(source.days.map((day) => [day.id, crypto.randomUUID()])),
      itemIds: options.duplicate
        ? Object.fromEntries(
            source.days.flatMap((day) => day.items).map((item) => [item.id, crypto.randomUUID()]),
          )
        : {},
    },
  });
}
