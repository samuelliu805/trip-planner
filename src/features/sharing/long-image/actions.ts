"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { getPublicItinerary } from "../data";
import { publicItineraryLinkSchema } from "../schema";
import { getSiteUrl } from "../site-url";
import type { PreparedShareImage, ShareActionResult, ShareImagePartInput } from "../types";
import { prepareShareImageSchema, shareImagePartInputSchema } from "./schema";

const prepareImageInputSchema = z
  .object({
    exportId: z.uuid().nullable(),
    mode: z.enum(["new_export", "replace_existing"]),
    sharePageId: z.uuid(),
  })
  .strict();

function imageError(error?: string) {
  if (error?.match(/OWNER|permission|row-level security/i))
    return "Only the Share Page owner can generate images.";
  if (error?.includes("UPLOAD")) return "The image upload is incomplete. Try again.";
  return "The permanent image could not be changed. Try again.";
}

export async function prepareShareImageVersion(
  rawInput: unknown,
): Promise<ShareActionResult<PreparedShareImage>> {
  const input = prepareImageInputSchema.safeParse(rawInput);
  if (!input.success) return { error: "Review the image version request." };
  const supabase = await createClient();
  const [{ data: userData }, pageResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("owner_share_page_v1", { target_share_page_id: input.data.sharePageId }),
  ]);
  if (!userData.user || pageResult.error) return { error: imageError(pageResult.error?.message) };
  const page = publicItineraryLinkSchema.safeParse(pageResult.data);
  if (!page.success) return { error: "The Share Page could not be read." };

  let destinationPage = page.data;
  if (page.data.longImageQrDestination === "share_page") {
    const destinationResult = page.data.longImageQrSharePageId
      ? await supabase.rpc("owner_share_page_v1", {
          target_share_page_id: page.data.longImageQrSharePageId,
        })
      : { data: null, error: null };
    const destination = publicItineraryLinkSchema.safeParse(destinationResult.data);
    if (!destination.success) return { error: "Choose an active Share Page for the QR code." };
    destinationPage = destination.data;
  }
  const siteUrl = getSiteUrl();
  const qrDestinationType =
    page.data.longImageQrDestination === "homepage" ? "homepage" : "share_page";
  const qrDestinationUrl =
    qrDestinationType === "homepage"
      ? `${siteUrl}/?utm_source=shared_image&utm_medium=qr`
      : `${siteUrl}/share/${destinationPage.publicToken}`;
  const { data, error } = await supabase.rpc("prepare_share_image_version_v1", {
    requested_mode: input.data.mode,
    requested_qr_destination_type: qrDestinationType,
    requested_qr_destination_url: qrDestinationUrl,
    requested_render_config: { renderer: "timeline", version: 1, width: 1080 },
    target_export_id: input.data.exportId,
    target_share_page_id: page.data.id,
  });
  if (error || !data) return { error: imageError(error?.message) };
  const rpcData = data as Record<string, unknown>;
  const enrichedSnapshot = await getPublicItinerary(page.data.publicToken);
  const prepared = prepareShareImageSchema.safeParse({
    ...rpcData,
    sourceSnapshot: enrichedSnapshot ?? rpcData.sourceSnapshot,
    uploadPathPrefix: `${userData.user.id}/${rpcData.exportId}/${rpcData.versionId}`,
  });
  return prepared.success
    ? { data: prepared.data }
    : { error: "The image render request could not be prepared." };
}

export async function finalizeShareImageVersion(rawInput: {
  parts: ShareImagePartInput[];
  versionId: string;
}): Promise<ShareActionResult<{ permanentSlug: string; partCount: number }>> {
  const input = z
    .object({ parts: shareImagePartInputSchema.array().min(1).max(20), versionId: z.uuid() })
    .strict()
    .safeParse(rawInput);
  if (!input.success) return { error: "The rendered image parts are invalid." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finalize_share_image_version_v1", {
    requested_parts: input.data.parts,
    target_version_id: input.data.versionId,
  });
  const parsed = z
    .object({ partCount: z.number().int().positive(), permanentSlug: z.string().length(24) })
    .passthrough()
    .safeParse(data);
  return error || !parsed.success
    ? { error: imageError(error?.message) }
    : { data: { partCount: parsed.data.partCount, permanentSlug: parsed.data.permanentSlug } };
}

export async function failShareImageVersion(versionId: string, message: string) {
  if (!z.uuid().safeParse(versionId).success) return;
  const supabase = await createClient();
  await supabase.rpc("fail_share_image_version_v1", {
    requested_error_message: message,
    target_version_id: versionId,
  });
}

export async function revokeShareImageExport(
  exportId: string,
): Promise<ShareActionResult<{ revoked: true }>> {
  if (!z.uuid().safeParse(exportId).success) return { error: "The image link is invalid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_share_image_export_v1", {
    target_export_id: exportId,
  });
  return error ? { error: imageError(error.message) } : { data: { revoked: true } };
}
