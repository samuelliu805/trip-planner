import "server-only";

import { mutationError } from "@/features/itinerary/action-helpers";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import {
  cityInputPlaceKey,
  neighboringCityError,
  prospectiveNeighboringCityConflict,
} from "@/features/routes/city-order";
import { getRelationalDatabase } from "@/platform/composition/server";

export function prospectiveCityError(
  workspace: PlannerWorkspace,
  input: {
    dayId: string;
    itemId?: string;
    placeId?: string | null;
    providerPlaceId?: string;
    title: string;
  },
) {
  const day = workspace.days.find(({ id }) => id === input.dayId);
  if (!day) return "The selected City day is unavailable.";
  const current = input.itemId
    ? workspace.days.flatMap(({ items }) => items).find(({ id }) => id === input.itemId)
    : undefined;
  const placeKey = cityInputPlaceKey(workspace.days, input.placeId, input.providerPlaceId);
  if (!placeKey) return "Choose a city from Google Maps.";
  const conflict = prospectiveNeighboringCityConflict(workspace.days, [
    {
      dayId: day.id,
      itemId: input.itemId ?? "prospective-city",
      placeKey,
      sortOrder:
        current?.sort_order ?? Math.max(-1, ...day.items.map(({ sort_order }) => sort_order)) + 1,
      title: input.title,
    },
  ]);
  return conflict ? neighboringCityError() : null;
}

export async function validateVariantDay(tripId: string, variantId: string, dayId: string) {
  const database = await getRelationalDatabase();
  const [{ data: variant, error: variantError }, { data: day, error: dayError }] =
    await Promise.all([
      database
        .from("route_variants")
        .select("id")
        .eq("id", variantId)
        .eq("trip_id", tripId)
        .maybeSingle(),
      database
        .from("trip_days")
        .select("id")
        .eq("id", dayId)
        .eq("variant_id", variantId)
        .maybeSingle(),
    ]);
  if (variantError || dayError || !variant || !day)
    return mutationError(
      variantError?.message ?? dayError?.message ?? "The selected route day is unavailable.",
    );
  return null;
}

export async function validateProspectiveCity(input: {
  dayId: string;
  itemId?: string;
  placeId?: string | null;
  providerPlaceId?: string;
  title: string;
  tripId: string;
  variantId: string;
}) {
  const { data: workspace, error } = await getPlannerWorkspace(input.tripId, input.variantId);
  if (error || !workspace) return error ?? "The City order could not be checked.";
  return prospectiveCityError(workspace, input);
}
