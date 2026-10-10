"use server";
import { after } from "next/server";
import { getRelationalDatabase } from "@/platform/composition/server";
import { attachmentBackgroundSchema } from "./background-schema";
import { drainAssetDeletionQueue } from "./cleanup.server";
import type { z } from "zod";
export async function runAttachmentBackgroundAction(
  raw: z.input<typeof attachmentBackgroundSchema>,
) {
  const parsed = attachmentBackgroundSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const value = parsed.data.input,
    database = await getRelationalDatabase();
  const { data, error } = await database.rpc("mutate_attachment_collection_v1", {
    target_trip_id: value.tripId,
    target_entity_id: value.entityId,
    requested_target: value.target,
    requested_action: value.action,
    requested_public_ref: value.publicRef,
    expected_link_version: value.expectedLinkVersion,
    expected_research_version: value.expectedResearchVersion as number,
    requested_include_in_share: value.includeInShare as boolean,
    target_operation_id: value.operationId,
  });
  if (error)
    return { error: error.message, code: error.code === "40001" ? "conflict" : "unexpected" };
  if (value.action === "delete") after(() => drainAssetDeletionQueue(10));
  return { data };
}
