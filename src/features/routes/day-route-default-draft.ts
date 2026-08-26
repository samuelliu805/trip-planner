import type { ItineraryItem } from "../itinerary/types.ts";
import { fixedDayRouteDraft, type FixedDayRouteDraft } from "./day-route-order.ts";
import type { RouteLegMode } from "./types.ts";

const maxRouteStops = 20;

export function defaultDayRouteDraft(
  eligibleItems: ItineraryItem[],
  suggestedMode: RouteLegMode,
  previousHotel?: ItineraryItem,
): FixedDayRouteDraft {
  const currentHotel = eligibleItems.find(({ type }) => type === "hotel");
  const currentLimit = previousHotel ? maxRouteStops - 1 : maxRouteStops;
  const selected = eligibleItems.slice(0, currentLimit);

  if (currentHotel && !selected.some(({ id }) => id === currentHotel.id)) {
    selected.splice(Math.max(0, selected.length - 1), 1, currentHotel);
  }

  const itemIds = [...(previousHotel ? [previousHotel.id] : []), ...selected.map(({ id }) => id)];
  return fixedDayRouteDraft(
    { itemIds, legModes: [] },
    eligibleItems.map(({ id }) => id),
    suggestedMode,
    previousHotel?.id,
    currentHotel?.id,
  );
}
