import React from "react";
import { useCopyItineraryItems } from "../../../src/features/itinerary/day-mutations";
import { usePlannerOutbox } from "../../../src/features/itinerary/planner-outbox-provider";
export function CrossPlanCopyProbe({ source, target }) {
  const runtime = usePlannerOutbox();
  const copy = useCopyItineraryItems(target.variant.trip_id, target.variant.id);
  React.useEffect(() => {
    window.__crossCopy = runtime;
  }, [runtime]);
  return (
    <button
      onClick={() => {
        const item = source.days
          .flatMap((day) => day.items)
          .find((item) => item.details?.ideaResearchItemId);
        if (!item) return;
        copy.mutate({
          tripId: target.variant.trip_id,
          variantId: target.variant.id,
          sourceVariantId: source.variant.id,
          targetDayId: target.days[0].id,
          sourceItemIds: [item.id],
          sourceVersions: [item.version],
          expectedItemsVersion: target.days[0].items_version,
          operationId: crypto.randomUUID(),
        });
      }}
    >
      Copy pending Idea to another Plan
    </button>
  );
}
