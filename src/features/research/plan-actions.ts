"use server";

import { createClient } from "@/lib/supabase/server";

import { firstIssue, researchDomainError, revalidateResearch } from "./action-helpers";
import { researchApplicationSchema, researchApplySchema } from "./schema";
import type {
  AppliedResearchResult,
  ApplyRpcResult,
  ResearchMutationResult,
  RevertRpcResult,
} from "./types";

export async function applyResearchItem(input: {
  researchItemId: string;
  scheduleChoice?: "automatic" | "keep_extra_days";
  targetItemId?: string | null;
  tripId: string;
  variantId: string;
}): Promise<ResearchMutationResult<AppliedResearchResult>> {
  const parsed = researchApplySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_research_item_to_variant_v2", {
    schedule_choice: parsed.data.scheduleChoice,
    target_item_id: parsed.data.targetItemId ?? undefined,
    target_research_item_id: parsed.data.researchItemId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error || !data) return { error: researchDomainError(error?.message) };
  const result = data as ApplyRpcResult;
  const [application, selection] = await Promise.all([
    supabase
      .from("research_plan_applications")
      .select("*")
      .eq("id", result.applicationId)
      .eq("trip_id", parsed.data.tripId)
      .maybeSingle(),
    supabase
      .from("variant_research_selections")
      .select("*")
      .eq("trip_id", parsed.data.tripId)
      .eq("route_variant_id", parsed.data.variantId)
      .eq("research_item_id", parsed.data.researchItemId)
      .maybeSingle(),
  ]);
  if (application.error || !application.data || selection.error || !selection.data)
    return { error: "The Plan changed, but its saved change record could not be refreshed." };
  revalidateResearch(parsed.data.tripId);
  return { data: { application: application.data, selection: selection.data } };
}

export async function revertResearchApplication(input: {
  applicationId: string;
  tripId: string;
}): Promise<ResearchMutationResult<RevertRpcResult>> {
  const parsed = researchApplicationSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revert_research_plan_application", {
    target_application_id: parsed.data.applicationId,
    target_trip_id: parsed.data.tripId,
  });
  if (error || !data) return { error: researchDomainError(error?.message) };
  revalidateResearch(parsed.data.tripId);
  return { data: data as RevertRpcResult };
}
