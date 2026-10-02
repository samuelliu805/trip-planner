import type { ItineraryItem } from "../itinerary/types.ts";
import { fixedDayRouteDraft, type FixedDayRouteDraft } from "./day-route-order.ts";
import { canonicalRouteLegMode, type DayRoutePlan, type RouteLegMode } from "./types.ts";

const maxRouteStops = 20;

export const savedDayRouteDraft = (plan: DayRoutePlan): FixedDayRouteDraft => ({
  itemIds: [...plan.stops].sort((a, b) => a.position - b.position).map(({ item_id }) => item_id),
  legModes: [...plan.legs]
    .sort((a, b) => a.position - b.position)
    .map(({ mode }) => canonicalRouteLegMode(mode)),
});

export function defaultDayRouteDraft(
  eligibleItems: ItineraryItem[],
  suggestedMode: RouteLegMode,
  previousHotel?: ItineraryItem,
): FixedDayRouteDraft {
  const currentHotel = eligibleItems.filter(({ type }) => type === "hotel").at(-1);
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
