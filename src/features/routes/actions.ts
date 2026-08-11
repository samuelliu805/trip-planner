"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPlannerWorkspace } from "@/features/itinerary/data";
import { calculateGoogleRouteLeg } from "@/lib/providers/routes/google-routes.server";
import { RouteProviderError } from "@/lib/providers/routes/errors";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

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
import {
  overviewRouteModes,
  routeLegModes,
  type CalculateDayRouteInput,
  type CalculateOverviewRouteInput,
  type ClearDayRouteInput,
  type DayRouteDraft,
  type DayRoutePlan,
  type RouteActionResult,
  type SaveDayRoutePlanInput,
} from "./types";

const identitySchema = z.string().uuid();
const saveSchema = z.object({
  dayId: identitySchema,
  itemIds: z.array(identitySchema).min(2).max(20),
  legModes: z.array(z.enum(routeLegModes)),
  tripId: identitySchema,
  variantId: identitySchema,
});
const calculateSchema = z.object({
  planId: identitySchema,
  tripId: identitySchema,
  variantId: identitySchema,
});
const calculateOverviewSchema = z.object({
  legs: z
    .array(
      z.object({
        mode: z.enum(overviewRouteModes),
        position: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(50)
    .superRefine((legs, context) => {
      if (new Set(legs.map(({ position }) => position)).size !== legs.length)
        context.addIssue({ code: "custom", message: "Overview leg positions must be unique." });
    }),
  tripId: identitySchema,
  variantId: identitySchema,
});
const clearSchema = z.object({
  dayId: identitySchema,
  tripId: identitySchema,
  variantId: identitySchema,
});

const actionError = (error: unknown) => {
  if (error instanceof RouteProviderError) return error.message;
  if (error instanceof Error) {
    if (/permission|row-level security|owner/i.test(error.message))
      return "Only the trip owner can configure or calculate routes.";
    return error.message;
  }
  return "The day route could not be changed.";
};

const loadWorkspace = async (tripId: string, variantId: string) => {
  const result = await getPlannerWorkspace(tripId, variantId);
  if (!result.data) throw new Error(result.error ?? "The planner could not be loaded.");
  return result.data;
};

export async function saveDayRoutePlan(
  input: SaveDayRoutePlanInput,
): Promise<RouteActionResult<DayRoutePlan>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the route stops." };
  if (parsed.data.legModes.length !== parsed.data.itemIds.length - 1)
    return { error: "Leg mode count must equal stop count minus one." };

  try {
    const workspace = await loadWorkspace(parsed.data.tripId, parsed.data.variantId);
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
            ? { latitude: item.place.latitude, longitude: item.place.longitude }
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
    if (validationError) return { error: validationError };

    const supabase = await createClient();
    const { data: planId, error } = await supabase.rpc("save_day_route_plan", {
      ordered_item_ids: parsed.data.itemIds,
      requested_leg_modes: parsed.data.legModes,
      target_day_id: parsed.data.dayId,
      target_variant_id: parsed.data.variantId,
    });
    if (error || !planId)
      throw new Error(error?.message ?? "The route configuration was not saved.");
    const refreshed = await loadWorkspace(parsed.data.tripId, parsed.data.variantId);
    const plan = refreshed.routePlans.find(({ id }) => id === planId);
    if (!plan) throw new Error("The saved route could not be reloaded.");
    revalidatePath(`/trips/${parsed.data.tripId}`);
    return { data: plan };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function calculateDayRoute(
  input: CalculateDayRouteInput,
): Promise<RouteActionResult<DayRoutePlan>> {
  const parsed = calculateSchema.safeParse(input);
  if (!parsed.success) return { error: "The route calculation request is invalid." };

  try {
    const supabase = await createClient();
    const { data: owner, error: ownerError } = await supabase.rpc("is_trip_owner", {
      target_trip_id: parsed.data.tripId,
    });
    if (ownerError || !owner) throw new Error("Trip owner access required.");

    const workspace = await loadWorkspace(parsed.data.tripId, parsed.data.variantId);
    const plan = workspace.routePlans.find(
      ({ id, trip_id }) => id === parsed.data.planId && trip_id === parsed.data.tripId,
    );
    if (!plan) throw new Error("The saved day route was not found.");
    const resolved = resolveRouteCalculationConfig(workspace, plan);
    if (!resolved.config) return { error: resolved.error ?? "The saved route needs editing." };

    const calculated = await calculateRouteConfiguration(
      resolved.config,
      plan.calculation,
      calculateGoogleRouteLeg,
      3,
    );
    if (calculated.cache !== "full") {
      const normalized = JSON.parse(JSON.stringify(calculated.legs)) as Json;
      const { error } = await supabase.rpc("save_day_route_calculation", {
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

    const refreshed = await loadWorkspace(parsed.data.tripId, parsed.data.variantId);
    const refreshedPlan = refreshed.routePlans.find(({ id }) => id === plan.id);
    if (!refreshedPlan) throw new Error("The calculated route could not be reloaded.");
    revalidatePath(`/trips/${parsed.data.tripId}`);
    return { cache: calculated.cache, data: refreshedPlan };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function calculateOverviewRoute(
  input: CalculateOverviewRouteInput,
): Promise<RouteActionResult<CalculatedRouteLeg[]>> {
  const parsed = calculateOverviewSchema.safeParse(input);
  if (!parsed.success) return { error: "The Overview route calculation request is invalid." };

  try {
    const supabase = await createClient();
    const { data: owner, error: ownerError } = await supabase.rpc("is_trip_owner", {
      target_trip_id: parsed.data.tripId,
    });
    if (ownerError || !owner) throw new Error("Trip owner access required.");

    const workspace = await loadWorkspace(parsed.data.tripId, parsed.data.variantId);
    const stages = deriveOverviewStages(workspace.days);
    if (stages.length < 2)
      return { error: "Add at least two city/town stages before calculating." };
    if (neighboringOverviewCityConflict(stages)) return { error: neighboringCityError() };

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
          coordinates: { latitude: from.latitude, longitude: from.longitude },
          itemId: from.entries[0].itemId,
        };
        const destination = {
          coordinates: { latitude: to.latitude, longitude: to.longitude },
          itemId: to.entries[0].itemId,
        };
        const legSignature = buildRouteLegSignature(
          configIdentity,
          position,
          origin,
          destination,
          mode,
        );
        return () =>
          calculateGoogleRouteLeg({
            destination: destination.coordinates,
            legSignature,
            mode,
            origin: origin.coordinates,
            position,
          });
      });

    return { data: await mapWithConcurrency(tasks, 3) };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function clearDayRoutePlan(
  input: ClearDayRouteInput,
): Promise<RouteActionResult<{ dayId: string }>> {
  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) return { error: "The route clear request is invalid." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("clear_day_route_plan", {
      target_day_id: parsed.data.dayId,
      target_variant_id: parsed.data.variantId,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/trips/${parsed.data.tripId}`);
    return { data: { dayId: parsed.data.dayId } };
  } catch (error) {
    return { error: actionError(error) };
  }
}
