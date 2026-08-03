import type { PlannerWorkspace } from "../itinerary/types.ts";

import { validateDayRouteDraft } from "./route-config.ts";
import type { DayRouteDraft, DayRoutePlan, RouteCalculationConfig } from "./types.ts";

export function resolveRouteCalculationConfig(
  workspace: PlannerWorkspace,
  plan: DayRoutePlan,
): { config?: RouteCalculationConfig; error?: string } {
  const day = workspace.days.find(({ id }) => id === plan.day_id);
  const previousDay = day
    ? workspace.days.find(({ day_number }) => day_number === day.day_number - 1)
    : undefined;
  const stops = [...plan.stops].sort((a, b) => a.position - b.position);
  const legs = [...plan.legs].sort((a, b) => a.position - b.position);
  if (!day || stops.some((stop, index) => stop.position !== index + 1)) {
    return { error: "The saved route has a missing or deleted stop and needs editing." };
  }
  if (
    legs.length !== stops.length - 1 ||
    legs.some(
      (leg, index) =>
        leg.position !== index + 1 ||
        leg.from_stop_id !== stops[index]?.id ||
        leg.to_stop_id !== stops[index + 1]?.id,
    )
  ) {
    return { error: "The saved route stop sequence is incomplete and needs editing." };
  }
  const itemsById = new Map(
    workspace.days.flatMap(({ items }) => items).map((item) => [item.id, item]),
  );
  const draft: DayRouteDraft = {
    dayId: plan.day_id,
    legModes: legs.map(({ mode }) => mode),
    previousDayId: previousDay?.id,
    stops: stops.map((stop) => {
      const item = itemsById.get(stop.item_id);
      return {
        coordinates: item?.place
          ? { latitude: item.place.latitude, longitude: item.place.longitude }
          : null,
        dayId: item?.day_id ?? "",
        itemId: stop.item_id,
        tripId: item?.trip_id ?? "",
        type: item?.type ?? "deleted",
        variantId: item?.variant_id ?? "",
      };
    }),
    tripId: plan.trip_id,
    variantId: plan.variant_id,
  };
  const validationError = validateDayRouteDraft(draft);
  if (validationError) return { error: validationError };
  return {
    config: {
      dayId: draft.dayId,
      legModes: draft.legModes,
      stops: draft.stops.map((stop) => ({ coordinates: stop.coordinates!, itemId: stop.itemId })),
      tripId: draft.tripId,
      variantId: draft.variantId,
    },
  };
}
