import type { ItineraryItem } from "../itinerary/types.ts";
import { fixedDayRouteDraft, type FixedDayRouteDraft } from "./day-route-order.ts";
import type { RouteLegMode } from "./types.ts";

const maxRouteStops = 20;
const autoIncludedTypes = new Set(["activity", "meal", "car_rental"]);

export type SynchronizedDayRouteDraft = {
  addedItemIds: string[];
  draft: FixedDayRouteDraft;
};

/**
 * Keeps explicit omissions intact while folding newly-created route stops into an existing plan.
 * Once the synchronized plan is saved, its newer timestamp makes a later explicit removal
 * authoritative.
 */
export function synchronizeSavedDayRouteDraft(
  saved: FixedDayRouteDraft,
  eligibleItems: ItineraryItem[],
  suggestedMode: RouteLegMode,
  planUpdatedAt: string,
  previousHotel?: ItineraryItem,
): SynchronizedDayRouteDraft {
  const currentHotel = eligibleItems.find(({ type }) => type === "hotel");
  const normalizedSaved = fixedDayRouteDraft(
    saved,
    eligibleItems.map(({ id }) => id),
    suggestedMode,
    previousHotel?.id,
    currentHotel?.id,
  );
  const savedIds = new Set(normalizedSaved.itemIds);
  const capacity = Math.max(0, maxRouteStops - normalizedSaved.itemIds.length);
  const addedItemIds = eligibleItems
    .filter(
      (item) =>
        !savedIds.has(item.id) &&
        autoIncludedTypes.has(item.type) &&
        item.created_at > planUpdatedAt,
    )
    .slice(0, capacity)
    .map(({ id }) => id);
  const draft = fixedDayRouteDraft(
    {
      itemIds: [...normalizedSaved.itemIds, ...addedItemIds],
      legModes: normalizedSaved.legModes,
    },
    eligibleItems.map(({ id }) => id),
    suggestedMode,
    previousHotel?.id,
    currentHotel?.id,
  );
  return { addedItemIds, draft };
}
