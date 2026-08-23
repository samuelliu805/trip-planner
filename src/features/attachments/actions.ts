"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { drainAssetDeletionQueue } from "./cleanup.server";
import { attachmentError, ownerAttachmentSchema } from "./schema";
import { createClient } from "../../lib/supabase/server";

const attachmentMutationSchema = z
  .object({
    itemId: z.uuid(),
    publicRef: z.string().regex(/^[0-9a-f]{64}$/),
    tripId: z.uuid(),
  })
  .strict();

export async function setAttachmentShare(
  rawInput: z.input<typeof attachmentMutationSchema> & { includeInShare: boolean },
) {
  const input = attachmentMutationSchema
    .extend({ includeInShare: z.boolean() })
    .safeParse(rawInput);
  if (!input.success) return { error: "The attachment request is invalid." };
  const supabase = await createClient();
  const result = await supabase.rpc("set_item_asset_share_v2", {
    requested_include_in_share: input.data.includeInShare,
    requested_public_ref: input.data.publicRef,
    target_item_id: input.data.itemId,
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
  const supabase = await createClient();
  const result = await supabase.rpc("detach_item_asset_v1", {
    requested_public_ref: input.data.publicRef,
    target_item_id: input.data.itemId,
    target_trip_id: input.data.tripId,
  });
  if (result.error) return { error: attachmentError(result.error.message) };
  await drainAssetDeletionQueue(10);
  revalidatePath(`/trips/${input.data.tripId}`);
  return { data: { publicRef: input.data.publicRef } };
}

export async function detachResearchAttachment(rawInput: {
  publicRef: string;
  researchItemId: string;
  tripId: string;
}) {
  const input = attachmentMutationSchema
    .omit({ itemId: true })
    .extend({ researchItemId: z.uuid() })
    .safeParse(rawInput);
  if (!input.success) return { error: "The attachment request is invalid." };
  const supabase = await createClient();
  const result = await supabase.rpc("detach_research_asset_v1", {
    requested_public_ref: input.data.publicRef,
    target_research_item_id: input.data.researchItemId,
    target_trip_id: input.data.tripId,
  });
  if (result.error) return { error: attachmentError(result.error.message) };
  await drainAssetDeletionQueue(10);
  revalidatePath(`/trips/${input.data.tripId}/compare`);
  return { data: { publicRef: input.data.publicRef } };
}
