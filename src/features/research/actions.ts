"use server";

import { createClient } from "@/lib/supabase/server";

import {
  firstIssue,
  persistResearchPlaces,
  researchItemValues,
  revalidateResearch,
} from "./action-helpers";
import {
  createResearchItemSchema,
  deleteResearchItemSchema,
  researchWorkspaceSchema,
  updateResearchItemSchema,
  type CreateResearchItemInput,
  type UpdateResearchItemInput,
} from "./schema";
import {
  getCompareItems,
  getResearchPlanSnapshot,
  getResearchPlanState,
  researchItemFromRow,
  researchItemSelection,
} from "./data";
import type { ResearchItem, ResearchMutationResult, ResearchWorkspaceSnapshot } from "./types";

export async function loadResearchWorkspace(input: {
  tripId: string;
  variantId: string;
}): Promise<ResearchMutationResult<ResearchWorkspaceSnapshot>> {
  const parsed = researchWorkspaceSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const [items, plan, state] = await Promise.all([
    getCompareItems(parsed.data.tripId),
    getResearchPlanSnapshot(parsed.data.tripId, parsed.data.variantId),
    getResearchPlanState(parsed.data.tripId, parsed.data.variantId),
  ]);
  const error = items.error ?? plan.error ?? state.error;
  if (error || !plan.data) return { error: error ?? "Ideas & Options could not be refreshed." };
  return {
    data: {
      applications: state.applications,
      currentApplicationIds: state.currentApplicationIds,
      items: items.data,
      plan: plan.data,
      selections: state.selections,
    },
  };
}

export async function createResearchItem(
  input: CreateResearchItemInput,
): Promise<ResearchMutationResult<ResearchItem>> {
  const parsed = createResearchItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  let places;
  try {
    places = await persistResearchPlaces(supabase, parsed.data);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The map location could not be saved.",
    };
  }
  const { data, error } = await supabase
    .from("research_items")
    .insert(researchItemValues(parsed.data, places))
    .select(researchItemSelection)
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "The candidate could not be saved." };
  revalidateResearch(parsed.data.tripId);
  return { data: researchItemFromRow(data) as ResearchItem };
}

export async function updateResearchItem(
  input: UpdateResearchItemInput,
): Promise<ResearchMutationResult<ResearchItem>> {
  const parsed = updateResearchItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  let places;
  try {
    places = await persistResearchPlaces(supabase, values);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The map location could not be saved.",
    };
  }
  const { data, error } = await supabase
    .from("research_items")
    .update(researchItemValues(values, places))
    .eq("id", id)
    .eq("trip_id", values.tripId)
    .select(researchItemSelection)
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "The candidate could not be updated." };
  revalidateResearch(values.tripId);
  return { data: researchItemFromRow(data) as ResearchItem };
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
  if (error || !data)
    return { error: "This saved option could not be deleted. Refresh and try again." };
  revalidateResearch(parsed.data.tripId);
  return { data };
}
