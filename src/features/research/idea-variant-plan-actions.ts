"use server";

import { z } from "zod";

import { getPlannerVariants } from "@/features/itinerary/data";
import { getTrip } from "@/features/trips/data";
import { getAuthProvider, runServerReads } from "@/platform/composition/server";
import { retryTransientRead } from "@/platform/transient-read";

import { getResearchPlanSnapshots } from "./data";
import type { ResearchMutationResult, ResearchPlanSnapshot } from "./types";

export async function loadIdeaVariantPlans(
  tripId: string,
): Promise<ResearchMutationResult<ResearchPlanSnapshot[]>> {
  if (!z.uuid().safeParse(tripId).success) return { error: "Invalid trip." };
  const [trip, user, variants] = await runServerReads([
    () => retryTransientRead(() => getTrip(tripId)),
    () => getAuthProvider().getCurrentUser(),
    () => retryTransientRead(() => getPlannerVariants(tripId)),
  ]);
  if (!trip.data || trip.data.owner_id !== user?.id)
    return { error: "The trip could not be loaded." };
  if (!variants.data) return { error: variants.error ?? "Plans could not be loaded." };
  const availableVariants = variants.data;
  const plans = await retryTransientRead(() => getResearchPlanSnapshots(tripId, availableVariants));
  return plans.data ? { data: plans.data } : { error: plans.error ?? "Plans could not be loaded." };
}
