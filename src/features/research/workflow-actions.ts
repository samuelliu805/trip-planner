"use server";
import { getRelationalDatabase } from "@/platform/composition/server";
import { ideaApplyInputSchema } from "./workflow-schema";
import type { z } from "zod";
export async function applyQueuedIdea(input: z.input<typeof ideaApplyInputSchema>) {
  const parsed = ideaApplyInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const value = parsed.data,
    database = await getRelationalDatabase();
  const { data, error } = await database.rpc("apply_idea_request_v2", {
    target_trip_id: value.tripId,
    target_variant_id: value.variantId,
    target_research_item_id: value.researchItemId as string,
    target_comparison_id: value.comparisonId as string,
    target_choice_id: value.choiceId as string,
    requested_day_id: value.dayId as string,
    requested_before_item_id: value.beforeItemId as string,
    requested_anchor_day_number: value.anchorDayNumber as number,
    expected_research_versions: value.expectedResearchVersions,
    expected_variant_version: value.expectedVariantVersion,
    expected_content_version: value.expectedContentVersion,
    expected_days_version: value.expectedDaysVersion,
    expected_items_version: value.expectedItemsVersion,
    target_operation_id: value.operationId,
  });
  return error
    ? { error: error.message, code: error.code === "40001" ? "conflict" : "unexpected" }
    : { data };
}
