"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { drainAssetDeletionQueue } from "./cleanup.server";
import { attachmentError, ownerAttachmentSchema } from "./schema";
import { getRelationalDatabase } from "@/platform/composition/server";
import { reportAttachmentMutation } from "./telemetry.server";

const attachmentMutationSchema = z
  .object({
    itemId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    publicRef: z.string().regex(/^[0-9a-f]{64}$/),
    tripId: z.uuid(),
    operationId: z.uuid(),
  })
  .strict();

export async function setAttachmentShare(
  rawInput: z.input<typeof attachmentMutationSchema> & { includeInShare: boolean },
) {
  const input = attachmentMutationSchema
    .extend({ includeInShare: z.boolean() })
    .safeParse(rawInput);
  if (!input.success) return { error: "The attachment request is invalid." };
  const database = await getRelationalDatabase();
  const result = await database.rpc("set_item_asset_share_v3", {
    expected_version: input.data.expectedVersion,
    requested_include_in_share: input.data.includeInShare,
    requested_public_ref: input.data.publicRef,
    target_item_id: input.data.itemId,
    target_operation_id: input.data.operationId,
    target_trip_id: input.data.tripId,
  });
  const attachment = ownerAttachmentSchema.safeParse(result.data);
  if (result.error || !attachment.success) return { error: attachmentError(result.error?.message) };
  revalidatePath(`/trips/${input.data.tripId}`);
  return { data: attachment.data };
}

export async function detachAttachment(rawInput: z.input<typeof attachmentMutationSchema>) {
  const input = attachmentMutationSchema.safeParse(rawInput);
  if (!input.success) return { error: "The attachment request is invalid." };
  const database = await getRelationalDatabase();
  const result = await database.rpc("detach_item_asset_v2", {
    expected_version: input.data.expectedVersion,
    requested_public_ref: input.data.publicRef,
    target_item_id: input.data.itemId,
    target_operation_id: input.data.operationId,
    target_trip_id: input.data.tripId,
  });
  if (result.error)
    return reportAttachmentMutation({
      mutation: "delete",
      operationId: input.data.operationId,
      result: { error: attachmentError(result.error.message) },
      target: "itinerary",
    });
  await drainAssetDeletionQueue(10);
  revalidatePath(`/trips/${input.data.tripId}`);
  return reportAttachmentMutation({
    mutation: "delete",
    operationId: input.data.operationId,
    result: { data: { publicRef: input.data.publicRef } },
    target: "itinerary",
  });
}

export async function detachResearchAttachment(rawInput: {
  expectedVersion: number;
  operationId: string;
  publicRef: string;
  researchItemId: string;
  tripId: string;
}) {
  const input = attachmentMutationSchema
    .omit({ itemId: true })
    .extend({ researchItemId: z.uuid() })
    .safeParse(rawInput);
  if (!input.success) return { error: "The attachment request is invalid." };
  const database = await getRelationalDatabase();
  const result = await database.rpc("detach_research_asset_v2", {
    expected_version: input.data.expectedVersion,
    requested_public_ref: input.data.publicRef,
    target_research_item_id: input.data.researchItemId,
    target_operation_id: input.data.operationId,
    target_trip_id: input.data.tripId,
  });
  if (result.error)
    return reportAttachmentMutation({
      mutation: "delete",
      operationId: input.data.operationId,
      result: { error: attachmentError(result.error.message) },
      target: "research",
    });
  await drainAssetDeletionQueue(10);
  revalidatePath(`/trips/${input.data.tripId}/compare`);
  return reportAttachmentMutation({
    mutation: "delete",
    operationId: input.data.operationId,
    result: { data: { publicRef: input.data.publicRef } },
    target: "research",
  });
}

export async function reportAttachmentUploadFailure(input: {
  operationId: string;
  target: "itinerary" | "research";
}) {
  await reportAttachmentMutation({
    mutation: "upload",
    operationId: input.operationId,
    result: { error: "The attachment could not be changed. Please try again." },
    target: input.target,
  });
}
