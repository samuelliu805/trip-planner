"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { validateRouteConfiguration } from "./configuration";
import type { ConfigureDayRouteInput } from "./types";

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
