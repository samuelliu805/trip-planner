import type { PlannerWorkspace } from "../itinerary/types.ts";
import { wgs84Coordinates, type Coordinates } from "../../lib/providers/maps/types.ts";

import { validateDayRouteDraft } from "./route-config.ts";
import type { DayRouteDraft, DayRoutePlan, RouteCalculationConfig } from "./types.ts";

export type RouteConfigDayInput = {
  dayNumber: number;
  id: string;
};

export type RouteConfigItemInput = {
  coordinates: Coordinates | null;
  dayId: string;
  itemId: string;
  tripId: string;
  type: string;
  variantId: string;
};

export type RouteConfigProjectionInput = {
  days: RouteConfigDayInput[];
  items: RouteConfigItemInput[];
};

export type RouteConfigPlanInput = Pick<DayRoutePlan, "day_id" | "trip_id" | "variant_id"> & {
  legs: Array<
    Pick<DayRoutePlan["legs"][number], "from_stop_id" | "mode" | "position" | "to_stop_id">
  >;
  stops: Array<Pick<DayRoutePlan["stops"][number], "id" | "item_id" | "position">>;
};

export function plannerRouteConfigProjection(
  workspace: PlannerWorkspace,
): RouteConfigProjectionInput {
  return {
    days: workspace.days.map((day) => ({ dayNumber: day.day_number, id: day.id })),
    items: workspace.days.flatMap((day) =>
      day.items.map((item) => ({
        coordinates: item.place
          ? wgs84Coordinates(item.place.latitude, item.place.longitude)
          : null,
        dayId: item.day_id,
        itemId: item.id,
        tripId: item.trip_id,
        type: item.type,
        variantId: item.variant_id,
      })),
    ),
  };
}

export function resolveRouteCalculationConfigFromProjection(
  projection: RouteConfigProjectionInput,
  plan: RouteConfigPlanInput,
): { config?: RouteCalculationConfig; error?: string } {
  const day = projection.days.find(({ id }) => id === plan.day_id);
  const previousDay = day
    ? projection.days.find(({ dayNumber }) => dayNumber === day.dayNumber - 1)
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
  const itemsById = new Map(projection.items.map((item) => [item.itemId, item]));
  const draft: DayRouteDraft = {
    dayId: plan.day_id,
    legModes: legs.map(({ mode }) => mode),
    previousDayId: previousDay?.id,
    stops: stops.map((stop) => {
      const item = itemsById.get(stop.item_id);
      return {
        coordinates: item?.coordinates ?? null,
        dayId: item?.dayId ?? "",
        itemId: stop.item_id,
        tripId: item?.tripId ?? "",
        type: item?.type ?? "deleted",
        variantId: item?.variantId ?? "",
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

export function resolveRouteCalculationConfig(
  workspace: PlannerWorkspace,
  plan: DayRoutePlan,
): { config?: RouteCalculationConfig; error?: string } {
  return resolveRouteCalculationConfigFromProjection(plannerRouteConfigProjection(workspace), plan);
}
