import React from "react";
import { useCopyItineraryItems } from "../../../src/features/itinerary/day-mutations";
import { usePlannerOutbox } from "../../../src/features/itinerary/planner-outbox-provider";
import { usePlannerClipboard } from "../../../src/features/itinerary/hooks/use-planner-clipboard";
export function CrossPlanCopyProbe({ source, target }) {
  const runtime = usePlannerOutbox();
  const copy = useCopyItineraryItems(target.variant.trip_id, target.variant.id);
  const [error, setError] = React.useState();
  const clipboard = usePlannerClipboard({
    selectionAnchor: { row: 0, column: 1 },
    selectionEnd: { row: 0, column: 1 },
    setInteractionError: setError,
    setInteractionConflict: () => {},
    tripId: target.variant.trip_id,
    workspace: target,
  });
  React.useEffect(() => {
    window.__crossCopy = runtime;
  }, [runtime]);
  return (
    <section>
      <button
        onClick={() =>
          clipboard.pastePayload({
            kind: "trip-planner/items",
            version: 2,
            source: { tripId: source.variant.trip_id, variantId: source.variant.id },
            sourceColumn: 1,
            cells: [{ rowOffset: 0, columnOffset: 0, items: [source.days[0].items[0].id] }],
          })
        }
      >
        Paste edited source to another Plan
      </button>
      <p role="alert">{error}</p>
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
    </section>
  );
}
