"use server";

import { getRelationalDatabase } from "@/platform/composition/server";

import { firstIssue, revalidateResearch } from "./action-helpers";
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
  getResearchItemSelection,
  getResearchPlanSnapshot,
  getResearchPlanState,
  researchItemFromRow,
  type ResearchItemRow,
} from "./data";
import type { ResearchItem, ResearchMutationResult, ResearchWorkspaceSnapshot } from "./types";
import { reportResearchMutation } from "./telemetry.server";
import type { Json } from "@/types/database";

function researchWriteError(error: { code?: string; message: string }) {
  return {
    code:
      error.code === "40001"
        ? ("conflict" as const)
        : error.code === "42501"
          ? ("forbidden" as const)
          : ("unexpected" as const),
    error:
      error.code === "40001"
        ? "Someone else changed this idea first. Reload the latest idea."
        : error.message,
  };
}

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

export async function loadResearchItem(
  tripId: string,
  researchItemId: string,
): Promise<ResearchMutationResult<ResearchItem>> {
  const database = await getRelationalDatabase();
  const { data, error } = await database
    .from("research_items")
    .select<ResearchItemRow>(getResearchItemSelection())
    .eq("id", researchItemId)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "The latest idea could not be loaded." };
  return { data: researchItemFromRow(data) };
}

export async function createResearchItem(
  input: CreateResearchItemInput,
): Promise<ResearchMutationResult<ResearchItem>> {
  const parsed = createResearchItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data: saved, error } = await database.rpc("save_research_item_v3", {
    expected_version: null as unknown as number,
    requested_draft_session_id: parsed.data.draftSessionId ?? parsed.data.operationId,
    requested_item: JSON.parse(JSON.stringify(parsed.data)) as Json,
    target_operation_id: parsed.data.operationId,
    target_research_item_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
  });
  if (error || !saved)
    return reportResearchMutation({
      category: parsed.data.category,
      mutation: "create",
      operationId: parsed.data.operationId,
      result: error ? researchWriteError(error) : { error: "The candidate could not be saved." },
    });
  const { data, error: reloadError } = await database
    .from("research_items")
    .select<ResearchItemRow>(getResearchItemSelection())
    .eq("id", parsed.data.operationId)
    .eq("trip_id", parsed.data.tripId)
    .maybeSingle();
  if (reloadError || !data)
    return reportResearchMutation({
      category: parsed.data.category,
      mutation: "create",
      operationId: parsed.data.operationId,
      result: { error: reloadError?.message ?? "The saved candidate could not be loaded." },
    });
  revalidateResearch(parsed.data.tripId);
  return reportResearchMutation({
    category: parsed.data.category,
    mutation: "create",
    operationId: parsed.data.operationId,
    result: { data: researchItemFromRow(data) },
  });
}

export async function updateResearchItem(
  input: UpdateResearchItemInput,
): Promise<ResearchMutationResult<ResearchItem>> {
  const parsed = updateResearchItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, expectedVersion, ...values } = parsed.data;
  const database = await getRelationalDatabase();
  const { data: saved, error } = await database.rpc("save_research_item_v3", {
    expected_version: expectedVersion,
    requested_draft_session_id: parsed.data.draftSessionId ?? parsed.data.operationId,
    requested_item: JSON.parse(JSON.stringify(values)) as Json,
    target_operation_id: parsed.data.operationId,
    target_research_item_id: id,
    target_trip_id: values.tripId,
  });
  if (error || !saved)
    return reportResearchMutation({
      category: parsed.data.category,
      mutation: "update",
      operationId: parsed.data.operationId,
      result: error ? researchWriteError(error) : { error: "The candidate could not be updated." },
    });
  const { data, error: reloadError } = await database
    .from("research_items")
    .select<ResearchItemRow>(getResearchItemSelection())
    .eq("id", id)
    .eq("trip_id", values.tripId)
    .maybeSingle();
  if (reloadError || !data)
    return reportResearchMutation({
      category: parsed.data.category,
      mutation: "update",
      operationId: parsed.data.operationId,
      result: { error: reloadError?.message ?? "The updated candidate could not be loaded." },
    });
  revalidateResearch(values.tripId);
  return reportResearchMutation({
    category: parsed.data.category,
    mutation: "update",
    operationId: parsed.data.operationId,
    result: { data: researchItemFromRow(data) },
  });
}

export async function deleteResearchItem(input: {
  category: "flight" | "rental" | "stay" | "train";
  id: string;
  expectedVersion: number;
  operationId: string;
  tripId: string;
}): Promise<ResearchMutationResult<{ id: string }>> {
  const parsed = deleteResearchItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("delete_research_item_v2", {
    expected_version: parsed.data.expectedVersion,
    target_operation_id: parsed.data.operationId,
    target_research_item_id: parsed.data.id,
    target_trip_id: parsed.data.tripId,
  });
  if (error || !data)
    return reportResearchMutation({
      category: parsed.data.category,
      mutation: "delete",
      operationId: parsed.data.operationId,
      result: error
        ? researchWriteError(error)
        : { error: "This saved option could not be deleted. Refresh and try again." },
    });
  revalidateResearch(parsed.data.tripId);
  return reportResearchMutation({
    category: parsed.data.category,
    mutation: "delete",
    operationId: parsed.data.operationId,
    result: { data: { id: parsed.data.id } },
  });
}
