"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPlannerWorkspace } from "@/features/itinerary/data";
import { calculateGoogleRouteLeg } from "@/lib/providers/routes/google-routes.server";
import { RouteProviderError } from "@/lib/providers/routes/errors";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { calculateRouteConfiguration } from "./calculator";
import { resolveRouteCalculationConfig } from "./plan-config";
import { validateDayRouteDraft } from "./route-config";
import {
  routeLegModes,
  type CalculateDayRouteInput,
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
const calculateSchema = z.object({ planId: identitySchema, tripId: identitySchema });
const clearSchema = z.object({
  dayId: identitySchema,
  tripId: identitySchema,
  variantId: identitySchema,
});

const actionError = (error: unknown) => {
  if (error instanceof RouteProviderError) return error.message;
  if (error instanceof Error) {
    if (/permission|row-level security|owner/i.test(error.message))
      return "Only the trip owner can change or calculate Route A.";
    return error.message;
  }
  return "The day route could not be changed.";
};

const loadWorkspace = async (tripId: string) => {
  const result = await getPlannerWorkspace(tripId);
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
    const workspace = await loadWorkspace(parsed.data.tripId);
    const day = workspace.days.find(({ id }) => id === parsed.data.dayId);
    const itemsById = new Map(day?.items.map((item) => [item.id, item]) ?? []);
    const draft: DayRouteDraft = {
      dayId: parsed.data.dayId,
      legModes: parsed.data.legModes,
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
    const refreshed = await loadWorkspace(parsed.data.tripId);
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

    const workspace = await loadWorkspace(parsed.data.tripId);
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
        calculated_total_duration_seconds: calculated.totalDurationSeconds as number,
        normalized_calculated_legs: normalized,
        target_plan_id: plan.id,
      });
      if (error) throw new Error(error.message);
    }

    const refreshed = await loadWorkspace(parsed.data.tripId);
    const refreshedPlan = refreshed.routePlans.find(({ id }) => id === plan.id);
    if (!refreshedPlan) throw new Error("The calculated route could not be reloaded.");
    revalidatePath(`/trips/${parsed.data.tripId}`);
    return { cache: calculated.cache, data: refreshedPlan };
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
