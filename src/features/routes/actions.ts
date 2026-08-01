"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createGoogleRoutesProvider, RouteProviderError } from "@/lib/providers/routes/google";
import type { Json } from "@/types/database";

import { validateRouteConfiguration } from "./configuration";
import type { ConfigureDayRouteInput } from "./types";
import { calculateWithCache } from "./calculation";
import { waypointSignature } from "./signature";

export async function configureDayRoute(input: ConfigureDayRouteInput) {
  const validationError = validateRouteConfiguration(input);
  if (validationError) return { error: validationError };
  const supabase = await createClient();
  const { error } = await supabase.rpc("configure_day_route", {
    ordered_item_ids: input.itemIds,
    requested_travel_mode: input.travelMode,
    target_day_id: input.dayId,
  });
  if (error)
    return {
      error: error.message.includes("permission")
        ? "You do not have permission to configure this route."
        : error.message,
    };
  revalidatePath("/trips");
  return { data: { dayId: input.dayId } };
}

export async function calculateDayRoute(dayId: string) {
  const supabase = await createClient();
  const { data: day, error: dayError } = await supabase
    .from("trip_days")
    .select("id, variant_id, route_travel_mode")
    .eq("id", dayId)
    .maybeSingle();
  if (dayError || !day) return { error: "The selected day could not be loaded." };
  const { data: rows, error: stopError } = await supabase
    .from("itinerary_items")
    .select("id, type, route_stop_order, place:places(latitude, longitude)")
    .eq("day_id", dayId)
    .not("route_stop_order", "is", null)
    .order("route_stop_order", { ascending: true });
  if (stopError) return { error: "The route stops could not be loaded." };
  if ((rows ?? []).some((row) => row.type === "flight"))
    return { error: "Flights cannot be included in a daily route." };
  const waypoints = (rows ?? []).flatMap((row) => {
    const place = row.place;
    return place && place.latitude !== null && place.longitude !== null
      ? [{ itemId: row.id, latitude: place.latitude, longitude: place.longitude }]
      : [];
  });
  if (waypoints.length !== (rows ?? []).length)
    return { error: "Every route stop needs saved coordinates." };
  if (waypoints.length < 2) return { error: "Select at least two stops before calculating." };
  if (waypoints.length > 27) return { error: "A route supports no more than 27 stops." };
  const signature = waypointSignature({
    dayId,
    travelMode: day.route_travel_mode,
    variantId: day.variant_id,
    waypoints,
  });
  const { data: cached } = await supabase
    .from("day_routes")
    .select("*")
    .eq("day_id", dayId)
    .maybeSingle();
  const cachedResult = cached
    ? {
        distanceMeters: cached.distance_meters,
        durationSeconds: cached.duration_seconds,
        encodedPolyline: cached.encoded_polyline,
        legs: cached.legs as Array<{ distanceMeters: number; durationSeconds: number }>,
        waypointSignature: cached.waypoint_signature,
      }
    : null;
  try {
    const calculated = await calculateWithCache({
      cached: cachedResult,
      provider: createGoogleRoutesProvider(),
      request: { travelMode: day.route_travel_mode, waypoints },
      signature,
    });
    if (!calculated.cacheHit) {
      const { error } = await supabase.from("day_routes").upsert(
        {
          computed_at: new Date().toISOString(),
          day_id: dayId,
          distance_meters: calculated.result.distanceMeters,
          duration_seconds: calculated.result.durationSeconds,
          encoded_polyline: calculated.result.encodedPolyline,
          legs: calculated.result.legs as Json,
          travel_mode: day.route_travel_mode,
          variant_id: day.variant_id,
          waypoint_signature: signature,
        },
        { onConflict: "day_id" },
      );
      if (error) return { error: "The calculated route could not be cached." };
    }
    revalidatePath("/trips");
    return { data: { ...calculated.result, cacheHit: calculated.cacheHit, waypointSignature: signature } };
  } catch (error) {
    return {
      error:
        error instanceof RouteProviderError
          ? error.message
          : "The route could not be calculated. Your previous route is still available.",
    };
  }
}
