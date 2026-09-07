"use server";

import { getRelationalDatabase } from "@/platform/composition/server";

import { firstIssue, researchDomainError, revalidateResearch } from "./action-helpers";
import { researchApplicationSchema, researchApplySchema } from "./schema";
import type {
  AppliedResearchResult,
  ApplyRpcResult,
  ResearchMutationResult,
  RevertRpcResult,
} from "./types";
import { reportResearchMutation } from "./telemetry.server";

export async function applyResearchItem(input: {
  category: "flight" | "rental" | "stay" | "train";
  expectedVersion: number;
  operationId: string;
  researchItemId: string;
  scheduleChoice?: "automatic" | "keep_extra_days";
  targetItemId?: string | null;
  tripId: string;
  variantId: string;
}): Promise<ResearchMutationResult<AppliedResearchResult>> {
  const parsed = researchApplySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("apply_research_item_to_variant_v3", {
    expected_research_version: parsed.data.expectedVersion,
    schedule_choice: parsed.data.scheduleChoice ?? "automatic",
    target_item_id: parsed.data.targetItemId as string,
    target_operation_id: parsed.data.operationId,
    target_research_item_id: parsed.data.researchItemId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error || !data)
    return reportResearchMutation({
      category: parsed.data.category,
      mutation: "apply",
      operationId: parsed.data.operationId,
      result: { error: researchDomainError(error?.message) },
    });
  const result = data as ApplyRpcResult;
  await reportResearchMutation({
    category: parsed.data.category,
    mutation: "apply",
    operationId: parsed.data.operationId,
    result: { data: result },
  });
  const [application, selection] = await Promise.all([
    database
      .from("research_plan_applications")
      .select("*")
      .eq("id", result.applicationId)
      .eq("trip_id", parsed.data.tripId)
      .maybeSingle(),
    database
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
  category: "flight" | "rental" | "stay" | "train";
  expectedVersion: number;
  operationId: string;
  tripId: string;
}): Promise<ResearchMutationResult<RevertRpcResult>> {
  const parsed = researchApplicationSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("revert_research_plan_application_v2", {
    expected_version: parsed.data.expectedVersion,
    target_application_id: parsed.data.applicationId,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
  });
  if (error || !data)
    return reportResearchMutation({
      category: parsed.data.category,
      mutation: "revert",
      operationId: parsed.data.operationId,
      result: { error: researchDomainError(error?.message) },
    });
  revalidateResearch(parsed.data.tripId);
  const result = data as RevertRpcResult;
  return reportResearchMutation({
    category: parsed.data.category,
    failureCode: result.status === "reverted" ? undefined : "conflict",
    mutation: "revert",
    operationId: parsed.data.operationId,
    result:
      result.status === "reverted"
        ? { data: result }
        : { error: "The Research choice could not be changed safely." },
  }).then(() => ({ data: result }));
}
