"use server";

import { revalidatePath } from "next/cache";

import { wgs84Coordinates } from "@/lib/providers/maps/types";
import { serializeRoutesV1CalculatedLegs } from "@/lib/providers/routes/persistence";
import { resolveRouteProvider } from "@/lib/providers/routes/resolver.server";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import { getRelationalDatabase } from "@/platform/composition/server";
import type { Json } from "@/types/database";

import { loadRouteWorkspace, routeActionError, withCalculatedRoute } from "./action-support";
import { calculateRouteConfiguration, mapWithConcurrency } from "./calculator";
import {
  deriveOverviewStages,
  isOverviewRouteLeg,
  neighboringOverviewCityConflict,
} from "./overview";
import { neighboringCityError } from "./city-order";
import { resolveRouteCalculationConfig } from "./plan-config";
import { validateDayRouteDraft } from "./route-config";
import { buildRouteLegSignature } from "./signatures";
import { reportRouteCalculation, reportRouteCalculationFailure } from "./telemetry.server";
import {
  calculateOverviewRouteSchema,
  calculateRouteSchema,
  clearRouteSchema,
  saveRouteSchema,
} from "./action-schemas";
import {
  type CalculateDayRouteInput,
  type CalculateOverviewRouteInput,
  type ClearDayRouteInput,
  type DayRouteDraft,
  type DayRoutePlan,
  type RouteActionResult,
  type SaveDayRoutePlanInput,
} from "./types";

export async function saveDayRoutePlan(
  input: SaveDayRoutePlanInput,
): Promise<RouteActionResult<DayRoutePlan>> {
  const parsed = saveRouteSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the route stops." };
  if (parsed.data.legModes.length !== parsed.data.itemIds.length - 1)
    return reportRouteCalculation({
      operationId: parsed.data.operationId,
      result: { error: "Leg mode count must equal stop count minus one." },
      routeMode: parsed.data.telemetryRouteMode,
      routeView: "day",
    });

  try {
    const workspace = await loadRouteWorkspace(parsed.data.tripId, parsed.data.variantId);
    const day = workspace.days.find(({ id }) => id === parsed.data.dayId);
    const previousDay = day
      ? workspace.days.find(({ day_number }) => day_number === day.day_number - 1)
      : undefined;
    const itemsById = new Map(
      workspace.days.flatMap(({ items }) => items).map((item) => [item.id, item]),
    );
    const draft: DayRouteDraft = {
      dayId: parsed.data.dayId,
      legModes: parsed.data.legModes,
      previousDayId: previousDay?.id,
      stops: parsed.data.itemIds.map((itemId) => {
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
      tripId: parsed.data.tripId,
      variantId: parsed.data.variantId,
    };
    const validationError = validateDayRouteDraft(draft);
    if (validationError) {
      await reportRouteCalculationFailure({
        error: validationError,
        operationId: parsed.data.operationId,
        routeMode: parsed.data.telemetryRouteMode,
        routeView: "day",
      });
      return { error: validationError };
    }

    const database = await getRelationalDatabase();
    const { data: planId, error } = await database.rpc("save_day_route_plan", {
      ordered_item_ids: parsed.data.itemIds,
      requested_leg_modes: parsed.data.legModes,
      target_day_id: parsed.data.dayId,
      target_variant_id: parsed.data.variantId,
    });
    if (error || !planId)
      throw new Error(error?.message ?? "The route configuration was not saved.");
    const refreshed = await loadRouteWorkspace(parsed.data.tripId, parsed.data.variantId);
    const plan = refreshed.routePlans.find(({ id }) => id === planId);
    if (!plan) throw new Error("The saved route could not be reloaded.");
    revalidatePath(`/trips/${parsed.data.tripId}`);
    return { data: plan };
  } catch (error) {
    const message = routeActionError(error);
    await reportRouteCalculationFailure({
      error: message,
      operationId: parsed.data.operationId,
      routeMode: parsed.data.telemetryRouteMode,
      routeView: "day",
    });
    return { error: message };
  }
}

export async function calculateDayRoute(
  input: CalculateDayRouteInput,
): Promise<RouteActionResult<DayRoutePlan>> {
  const parsed = calculateRouteSchema.safeParse(input);
  if (!parsed.success) return { error: "The route calculation request is invalid." };

  try {
    const database = await getRelationalDatabase();
    const { data: owner, error: ownerError } = await database.rpc("is_trip_owner", {
      target_trip_id: parsed.data.tripId,
    });
    if (ownerError || !owner) throw new Error("Trip owner access required.");

    const workspace = await loadRouteWorkspace(parsed.data.tripId, parsed.data.variantId);
    const plan = workspace.routePlans.find(
      ({ id, trip_id }) => id === parsed.data.planId && trip_id === parsed.data.tripId,
    );
    if (!plan) throw new Error("The saved day route was not found.");
    const resolved = resolveRouteCalculationConfig(workspace, plan);
    if (!resolved.config)
      return reportRouteCalculation({
        operationId: parsed.data.operationId,
        result: { error: resolved.error ?? "The saved route needs editing." },
        routeMode: parsed.data.telemetryRouteMode,
        routeView: "day",
      });

    const calculated = await calculateRouteConfiguration(
      resolved.config,
      plan.calculation,
      resolveRouteProvider,
      3,
    );
    const normalizedLegs = serializeRoutesV1CalculatedLegs(calculated.legs);
    if (calculated.cache !== "full") {
      const normalized = JSON.parse(JSON.stringify(normalizedLegs)) as Json;
      const { error } = await database.rpc("save_day_route_calculation", {
        calculated_config_signature: calculated.configSignature,
        calculated_provider_schema_version: "routes-v1",
        calculated_total_distance_meters: calculated.totalDistanceMeters,
        // Postgres accepts NULL here; the generated RPC argument omits nullability.
        calculated_total_duration_seconds: calculated.totalDurationSeconds as number,
        normalized_calculated_legs: normalized,
        target_plan_id: plan.id,
      });
      if (error) throw new Error(error.message);
    }

    revalidatePath(`/trips/${parsed.data.tripId}`);
    return reportRouteCalculation({
      operationId: parsed.data.operationId,
      result: { cache: calculated.cache, data: withCalculatedRoute(plan, calculated) },
      routeMode: parsed.data.telemetryRouteMode,
      routeView: "day",
    });
  } catch (error) {
    return reportRouteCalculation({
      operationId: parsed.data.operationId,
      result: { error: routeActionError(error) },
      routeMode: parsed.data.telemetryRouteMode,
      routeView: "day",
    });
  }
}

export async function calculateOverviewRoute(
  input: CalculateOverviewRouteInput,
): Promise<RouteActionResult<CalculatedRouteLeg[]>> {
  const parsed = calculateOverviewRouteSchema.safeParse(input);
  if (!parsed.success) return { error: "The Overview route calculation request is invalid." };

  try {
    const database = await getRelationalDatabase();
    const { data: owner, error: ownerError } = await database.rpc("is_trip_owner", {
      target_trip_id: parsed.data.tripId,
    });
    if (ownerError || !owner) throw new Error("Trip owner access required.");

    const workspace = await loadRouteWorkspace(parsed.data.tripId, parsed.data.variantId);
    const stages = deriveOverviewStages(workspace.days);
    if (stages.length < 2)
      return reportRouteCalculation({
        operationId: parsed.data.operationId,
        result: { error: "Add at least two city/town stages before calculating." },
        routeMode: parsed.data.telemetryRouteMode,
        routeView: "overview",
      });
    if (neighboringOverviewCityConflict(stages))
      return reportRouteCalculation({
        operationId: parsed.data.operationId,
        result: { error: neighboringCityError() },
        routeMode: parsed.data.telemetryRouteMode,
        routeView: "overview",
      });

    const routeProvider = resolveRouteProvider();
    const tasks = parsed.data.legs
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(({ mode, position }) => {
        const from = stages[position - 1];
        const to = stages[position];
        if (!from || !to)
          throw new Error("The Overview route changed. Review the city/town stages.");
        if (!isOverviewRouteLeg(from, to))
          throw new Error("That city/town stage boundary does not need a route calculation.");
        const configIdentity = {
          dayId: "trip-overview",
          tripId: parsed.data.tripId,
          variantId: workspace.variant.id,
        };
        const origin = {
          coordinates: wgs84Coordinates(from.latitude, from.longitude),
          itemId: from.entries[0].itemId,
        };
        const destination = {
          coordinates: wgs84Coordinates(to.latitude, to.longitude),
          itemId: to.entries[0].itemId,
        };
        const legSignature = buildRouteLegSignature(
          configIdentity,
          position,
          origin,
          destination,
          mode,
          routeProvider.id,
        );
        return () =>
          routeProvider.calculateLeg({
            destination: destination.coordinates,
            legSignature,
            mode,
            origin: origin.coordinates,
            position,
          });
      });

    return reportRouteCalculation({
      operationId: parsed.data.operationId,
      result: { data: await mapWithConcurrency(tasks, 3) },
      routeMode: parsed.data.telemetryRouteMode,
      routeView: "overview",
    });
  } catch (error) {
    return reportRouteCalculation({
      operationId: parsed.data.operationId,
      result: { error: routeActionError(error) },
      routeMode: parsed.data.telemetryRouteMode,
      routeView: "overview",
    });
  }
}

export async function clearDayRoutePlan(
  input: ClearDayRouteInput,
): Promise<RouteActionResult<{ dayId: string }>> {
  const parsed = clearRouteSchema.safeParse(input);
  if (!parsed.success) return { error: "The route clear request is invalid." };
  try {
    const database = await getRelationalDatabase();
    const { error } = await database.rpc("clear_day_route_plan", {
      target_day_id: parsed.data.dayId,
      target_variant_id: parsed.data.variantId,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/trips/${parsed.data.tripId}`);
    return { data: { dayId: parsed.data.dayId } };
  } catch (error) {
    return { error: routeActionError(error) };
  }
}
