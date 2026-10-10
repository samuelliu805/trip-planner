import type { QueryClient } from "@tanstack/react-query";
import type { BackgroundActionOwner } from "../editing/background-action-owner";
import { plannerQueryKey } from "../itinerary/planner-query";
import type { PlannerWorkspace } from "../itinerary/types";
import { sourceSnapshot } from "../variants/sync-intent";
import { captureApplicationProjection } from "./application-projection";
import { captureOwnedSources } from "./capture-owned-sources";
import type { ResearchItem, ResearchPlanSnapshot } from "./types";

export function enqueueBookingApplication(
  owner: BackgroundActionOwner,
  client: QueryClient,
  item: ResearchItem,
  plan: ResearchPlanSnapshot,
  options: {
    operationId: string;
    targetItemId?: string;
    keepExtraDays: boolean;
    beforeAccept: () => void;
  },
) {
  const workspace = client.getQueryData<PlannerWorkspace>(
    plannerQueryKey(item.trip_id, plan.variantId),
  );
  const baseline = workspace?.variant ?? plan.variant;
  if (!baseline) throw new Error("Reload the target Plan before applying this booking.");
  const accepted = captureOwnedSources(owner.scope, client, [item]),
    source = accepted.items[0];
  options.beforeAccept();
  return owner.accept({
    kind: "booking.apply",
    sourceBefore: accepted.sourceBefore,
    projection: workspace
      ? captureApplicationProjection(workspace, [source], {
          booking: true,
          targetId: options.targetItemId,
          keepExtraDays: options.keepExtraDays,
        })
      : undefined,
    before: workspace ? sourceSnapshot(workspace) : "",
    input: {
      category: source.category as "flight" | "rental" | "stay" | "train",
      expectedVersion: source.version,
      expectedVariantVersion: baseline.version,
      expectedContentVersion: baseline.content_version,
      expectedDaysVersion: baseline.days_version,
      expectedItemsVersion: baseline.items_version,
      operationId: options.operationId,
      researchItemId: source.id,
      scheduleChoice: options.keepExtraDays ? "keep_extra_days" : "automatic",
      targetItemId: options.targetItemId,
      tripId: source.trip_id,
      variantId: plan.variantId,
    },
  });
}
