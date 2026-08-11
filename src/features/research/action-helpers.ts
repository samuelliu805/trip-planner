import "server-only";

import { revalidatePath } from "next/cache";

import { persistPlaceSnapshot } from "@/features/itinerary/action-helpers";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { createResearchItemSchema } from "./schema";

const researchDomainMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Sign in again before changing this Plan.",
  RESEARCH_APPLICATION_NOT_FOUND: "That Apply record is no longer available.",
  RESEARCH_APPLICATION_SUPERSEDED:
    "A newer option has replaced this Apply record. View the current option instead.",
  RESEARCH_APPLY_CATEGORY_UNSUPPORTED:
    "Apply is currently available for Flights, Stays, Trains, and Rentals.",
  RESEARCH_CONTEXT_VARIANT_MISMATCH: "This saved context belongs to another Plan.",
  RESEARCH_IMPACT_DATE_SHIFT: "Review the date shift before changing the Plan.",
  RESEARCH_IMPACT_MANUAL_REVIEW: "This option needs manual review before Apply.",
  RESEARCH_IMPACT_STRUCTURAL:
    "This option changes the Plan structure and cannot be applied automatically.",
  RESEARCH_ITEM_NOT_FOUND: "That saved candidate is no longer available.",
  RESEARCH_ITEM_NOT_READY: "Add the missing comparison details before applying this option.",
  RESEARCH_PLAN_DAY_LIMIT: "This option would make the Plan longer than 366 days.",
  RESEARCH_SHORTEN_REQUIRES_REVIEW:
    "This flight is shorter than the Plan and the extra days contain saved work. Choose whether to keep those days.",
  RESEARCH_SELECTION_REQUIRED: "The Plan choice changed. Try applying this option again.",
  RESEARCH_TARGET_AMBIGUOUS: "The canonical target is ambiguous. Review the Plan first.",
  RESEARCH_TARGET_CONFLICT: "The canonical Plan changed and now needs manual review.",
  RESEARCH_TARGET_MISSING: "The canonical target no longer exists.",
  TRIP_OWNER_REQUIRED: "Only the trip owner can change Research selections.",
  VARIANT_NOT_FOUND: "The selected Plan is no longer available.",
};

export function researchDomainError(message?: string) {
  const code = Object.keys(researchDomainMessages).find((candidate) =>
    message?.includes(candidate),
  );
  return code ? researchDomainMessages[code] : "The Research choice could not be changed safely.";
}

export function firstIssue(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Check the price candidate details.";
}

export function researchItemValues(
  data: ReturnType<typeof createResearchItemSchema.parse>,
  places: { destination: string | null; location: string | null; origin: string | null },
) {
  const hasPrice = data.totalPriceAmount !== null && data.totalPriceAmount !== undefined;
  return {
    category: data.category,
    currency: hasPrice ? data.currency : null,
    day_id: data.dayId,
    destination_text: data.destinationText,
    destination_place_id: places.destination,
    end_date: data.endDate,
    end_time: data.endTime,
    itinerary_item_id: data.itemId,
    journey_type: data.journeyType,
    links: data.links as Json,
    location_text: data.locationText,
    location_place_id: places.location,
    note: data.note,
    observed_at: new Date().toISOString(),
    origin_text: data.originText,
    origin_place_id: places.origin,
    segments: data.segments as Json,
    source_url: data.sourceUrl,
    start_date: data.startDate,
    start_time: data.startTime,
    title: data.title,
    total_price_amount: hasPrice ? data.totalPriceAmount : null,
    trip_id: data.tripId,
  };
}

export async function persistResearchPlaces(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: ReturnType<typeof createResearchItemSchema.parse>,
) {
  const [destination, location, origin] = await Promise.all([
    data.destinationPlaceSnapshot
      ? persistPlaceSnapshot(supabase, data.tripId, data.destinationPlaceSnapshot)
      : Promise.resolve(data.destinationPlaceId ?? null),
    data.locationPlaceSnapshot
      ? persistPlaceSnapshot(supabase, data.tripId, data.locationPlaceSnapshot)
      : Promise.resolve(data.locationPlaceId ?? null),
    data.originPlaceSnapshot
      ? persistPlaceSnapshot(supabase, data.tripId, data.originPlaceSnapshot)
      : Promise.resolve(data.originPlaceId ?? null),
  ]);
  return { destination, location, origin };
}

export function revalidateResearch(tripId: string) {
  revalidatePath(`/trips/${tripId}/compare`);
  revalidatePath(`/trips/${tripId}`);
}
