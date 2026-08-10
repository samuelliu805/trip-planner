"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import {
  createResearchItemSchema,
  deleteResearchItemSchema,
  updateResearchItemSchema,
  type CreateResearchItemInput,
  type UpdateResearchItemInput,
} from "./schema";
import type { ResearchItem, ResearchMutationResult } from "./types";

function firstIssue(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Check the price candidate details.";
}

function researchItemValues(data: ReturnType<typeof createResearchItemSchema.parse>) {
  const hasPrice = data.totalPriceAmount !== null && data.totalPriceAmount !== undefined;
  return {
    category: data.category,
    currency: hasPrice ? data.currency : null,
    day_id: data.dayId,
    destination_text: data.destinationText,
    end_date: data.endDate,
    itinerary_item_id: data.itemId,
    location_text: data.locationText,
    note: data.note,
    observed_at: new Date().toISOString(),
    origin_text: data.originText,
    source_url: data.sourceUrl,
    start_date: data.startDate,
    title: data.title,
    total_price_amount: hasPrice ? data.totalPriceAmount : null,
    trip_id: data.tripId,
  };
}

function revalidateResearch(tripId: string) {
  revalidatePath(`/trips/${tripId}/compare`);
  revalidatePath(`/trips/${tripId}`);
}

export async function createResearchItem(
  input: CreateResearchItemInput,
): Promise<ResearchMutationResult<ResearchItem>> {
  const parsed = createResearchItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_items")
    .insert(researchItemValues(parsed.data))
    .select("*")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "The candidate could not be saved." };
  revalidateResearch(parsed.data.tripId);
  return { data };
}

export async function updateResearchItem(
  input: UpdateResearchItemInput,
): Promise<ResearchMutationResult<ResearchItem>> {
  const parsed = updateResearchItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_items")
    .update(researchItemValues(values))
    .eq("id", id)
    .eq("trip_id", values.tripId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "The candidate could not be updated." };
  revalidateResearch(values.tripId);
  return { data };
}

export async function deleteResearchItem(input: {
  id: string;
  tripId: string;
}): Promise<ResearchMutationResult<{ id: string }>> {
  const parsed = deleteResearchItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_items")
    .delete()
    .eq("id", parsed.data.id)
    .eq("trip_id", parsed.data.tripId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "The candidate could not be deleted." };
  revalidateResearch(parsed.data.tripId);
  return { data };
}
