"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { after } from "next/server";

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

export async function loadLatestAttachments(input: {
  entityId: string;
  target: "itinerary" | "research";
  tripId: string;
}) {
  const parsed = z
    .object({ entityId: z.uuid(), target: z.enum(["itinerary", "research"]), tripId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { error: "The attachment request is invalid." };
  const database = await getRelationalDatabase();
  const result = await database.rpc("read_attachment_collection_v1", {
    target_trip_id: parsed.data.tripId,
    target_entity_id: parsed.data.entityId,
    requested_target: parsed.data.target,
  });
  if (result.error) return { error: attachmentError(result.error.message) };
  if (!result.data)
    return { deleted: true as const, error: "This item was deleted or your access was revoked." };
  const snapshot = z
    .object({
      attachments: z.array(ownerAttachmentSchema),
      attachmentsVersion: z.number().int().positive(),
      version: z.number().int().positive(),
    })
    .safeParse(result.data);
  if (!snapshot.success) return { error: "The saved attachment response is invalid." };
  return {
    data: snapshot.data.attachments,
    version: snapshot.data.version,
    attachmentsVersion: snapshot.data.attachmentsVersion,
  };
}

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
  after(() => drainAssetDeletionQueue(10));
  revalidatePath(`/trips/${input.data.tripId}`);
  return reportAttachmentMutation({
    mutation: "delete",
    operationId: input.data.operationId,
    result: { data: { publicRef: input.data.publicRef } },
    target: "itinerary",
  });
}

export async function detachResearchAttachment(rawInput: {
  expectedLinkVersion: number;
  expectedResearchVersion: number;
  operationId: string;
  publicRef: string;
  researchItemId: string;
  tripId: string;
}) {
  const input = attachmentMutationSchema
    .omit({ expectedVersion: true, itemId: true })
    .extend({
      expectedLinkVersion: z.number().int().positive(),
      expectedResearchVersion: z.number().int().positive(),
      researchItemId: z.uuid(),
    })
    .safeParse(rawInput);
  if (!input.success) return { error: "The attachment request is invalid." };
  const database = await getRelationalDatabase();
  const result = await database.rpc("detach_research_asset_v3", {
    expected_link_version: input.data.expectedLinkVersion,
    expected_research_version: input.data.expectedResearchVersion,
    requested_public_ref: input.data.publicRef,
    target_research_item_id: input.data.researchItemId,
    target_operation_id: input.data.operationId,
    target_trip_id: input.data.tripId,
  });
  if (result.error)
    return reportAttachmentMutation({
      mutation: "delete",
      operationId: input.data.operationId,
      result: {
        code: result.error.code === "40001" ? "conflict" : "unexpected",
        error: attachmentError(result.error.message),
      },
      target: "research",
    });
  after(() => drainAssetDeletionQueue(10));
  revalidatePath(`/trips/${input.data.tripId}/compare`);
  return reportAttachmentMutation({
    mutation: "delete",
    operationId: input.data.operationId,
    result: {
      data: {
        publicRef: input.data.publicRef,
        version: Number((result.data as { version?: number } | null)?.version),
      },
    },
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
