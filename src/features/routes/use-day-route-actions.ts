"use client";

import { useQueryClient } from "@tanstack/react-query";

import { isItineraryConflict } from "@/features/itinerary/query-cache";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";
import { wgs84Coordinates } from "@/lib/providers/maps/types";
import type { RouteMode, TelemetryActorType } from "@/lib/telemetry/events";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import type { FixedDayRouteDraft } from "./day-route-order";
import { useRouteTasks } from "./use-route-tasks";
import { dayRouteInputSnapshot } from "./input-snapshot";
import { validateDayRouteDraft } from "./route-config";
import {
  canonicalRouteLegMode,
  type DayRouteDraft,
  type DayRoutePlan,
  type RouteLegMode,
} from "./types";

const telemetryRouteMode = (modes: RouteLegMode[]): RouteMode => {
  const values = new Set(modes.map(canonicalRouteLegMode));
  return values.size === 0 ? "unset" : values.size === 1 ? ([...values][0] as RouteMode) : "mixed";
};

export function useDayRouteActions({
  activeDay,
  actorType,
  plan,
  previousDay,
  setConflictDayId,
  discardDraftIfMatches,
  setError,
  stopItems,
  tripId,
  variantId,
}: {
  activeDay?: PlannerDay;
  actorType: TelemetryActorType;
  plan?: DayRoutePlan;
  previousDay?: PlannerDay;
  setConflictDayId: (dayId?: string) => void;
  discardDraftIfMatches: (value: FixedDayRouteDraft | null) => void;
  setError: (value?: string) => void;
  stopItems: ItineraryItem[];
  tripId: string;
  variantId: string;
}) {
  const queryClient = useQueryClient();
  const runtime = useRouteTasks(tripId, variantId);
  const operations =
    runtime?.queue.operations.filter((op) => op.resources.includes(activeDay?.id ?? "")) ?? [];
  const pending = operations.some((op) => op.status === "queued" || op.status === "sending");
  const failure = operations.find((op) => op.status === "failed" || op.status === "conflict");

  async function reloadLatest() {
    if (!activeDay) return;
    await queryClient.refetchQueries({
      queryKey: plannerQueryKey(tripId, variantId),
      type: "active",
    });
    setConflictDayId(undefined);
    setError(undefined);
  }

  async function persistAndCalculate(value: FixedDayRouteDraft | null) {
    if (!activeDay || !value) return;
    const itemsById = new Map(stopItems.map((item) => [item.id, item]));
    const routeDraft: DayRouteDraft = {
      dayId: activeDay.id,
      legModes: value.legModes,
      previousDayId: previousDay?.id,
      stops: value.itemIds.map((itemId) => {
        const item = itemsById.get(itemId);
        return {
          coordinates: item?.place
            ? wgs84Coordinates(item.place.latitude, item.place.longitude)
            : null,
          dayId: item?.day_id ?? "",
          itemId,
          tripId: item?.trip_id ?? "",
          type: item?.type ?? "deleted",
          variantId: item?.variant_id ?? "",
        };
      }),
      tripId,
      variantId,
    };
    const validationError = validateDayRouteDraft(routeDraft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(undefined);
    const operationId = newTelemetryOperationId();
    const routeMode = telemetryRouteMode(value.legModes);
    captureBrowserProductEvent(
      "route_calculation_started",
      {
        operation_id: operationId,
        route_mode: routeMode,
        route_view: "day",
        surface: "route_panel",
      },
      { actorType },
    );
    try {
      if (!runtime)
        throw new Error("Route configuration could not be stored locally. Your draft is kept.");
      runtime.accept({
        kind: "day",
        input: {
          dayId: activeDay.id,
          expectedVersion: plan?.version ?? 0,
          itemIds: value.itemIds,
          legModes: value.legModes,
          tripId,
          variantId,
          operationId,
          telemetryRouteMode: routeMode,
        },
        calculateOperationId: newTelemetryOperationId(),
        expectedInputSnapshot: dayRouteInputSnapshot({
          tripId,
          variantId,
          dayId: activeDay.id,
          legModes: value.legModes,
          stops: routeDraft.stops.map((stop) => ({
            itemId: stop.itemId,
            coordinates: stop.coordinates!,
          })),
        }),
      });
      discardDraftIfMatches(value);
    } catch (caught) {
      setConflictDayId(isItineraryConflict(caught) ? activeDay.id : undefined);
      setError(caught instanceof Error ? caught.message : "The day route could not be calculated.");
    }
  }

  async function clearRoute() {
    if (!activeDay || !plan) return;
    setError(undefined);
    try {
      if (!runtime) throw new Error("The clear request could not be stored locally.");
      runtime.accept({
        kind: "clear",
        input: {
          dayId: activeDay.id,
          expectedVersion: plan.version,
          operationId: newTelemetryOperationId(),
          tripId,
          variantId,
        },
      });
      // Clearing a saved route does not discard a newer configuration draft.
    } catch (caught) {
      setConflictDayId(isItineraryConflict(caught) ? activeDay.id : undefined);
      setError(caught instanceof Error ? caught.message : "The day route could not be cleared.");
    }
  }

  return { clearRoute, pending, failure, persistAndCalculate, reloadLatest };
}
