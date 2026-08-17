"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { getPublicItinerary } from "../data";
import { getRequestSiteUrl } from "../request-site-url";
import { publicItineraryLinkSchema, publicItinerarySchema } from "../schema";
import type { PreparedShareImage, ShareActionResult, ShareImagePartInput } from "../types";
import {
  longImageRenderConfigSchema,
  longImageScopeSchema,
  prepareShareImageSchema,
  shareImagePartInputSchema,
} from "./schema";
import { longImageScopeFromPage, scopePublicItinerary } from "./scope";

const prepareImageInputSchema = z
  .object({
    exportId: z.uuid().nullable(),
    mode: z.enum(["new_export", "replace_existing"]),
    sharePageId: z.uuid(),
    scope: longImageScopeSchema.optional(),
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
    supabase.rpc("owner_share_page_v2", { target_share_page_id: input.data.sharePageId }),
  ]);
  if (!userData.user || pageResult.error) return { error: imageError(pageResult.error?.message) };
  const page = publicItineraryLinkSchema.safeParse(pageResult.data);
  if (!page.success) return { error: "The Share Page could not be read." };

  let destinationPage = page.data;
  if (page.data.longImageQrDestination === "share_page") {
    const destinationResult = page.data.longImageQrSharePageId
      ? await supabase.rpc("owner_share_page_v2", {
          target_share_page_id: page.data.longImageQrSharePageId,
        })
      : { data: null, error: null };
    const destination = publicItineraryLinkSchema.safeParse(destinationResult.data);
    if (!destination.success) return { error: "Choose an active Share Page for the QR code." };
    destinationPage = destination.data;
  }
  const siteUrl = await getRequestSiteUrl();
  const qrDestinationType =
    page.data.longImageQrDestination === "homepage" ? "homepage" : "share_page";
  const qrDestinationUrl =
    qrDestinationType === "homepage"
      ? `${siteUrl}/?utm_source=shared_image&utm_medium=qr`
      : `${siteUrl}/share/${destinationPage.publicToken}`;
  const renderConfig = {
    renderer: "timeline" as const,
    scope: input.data.scope ?? longImageScopeFromPage(page.data),
    version: 1 as const,
    width: 1080 as const,
  };
  const { data, error } = await supabase.rpc("prepare_share_image_version_v2", {
    requested_mode: input.data.mode,
    requested_qr_destination_type: qrDestinationType,
    requested_qr_destination_url: qrDestinationUrl,
    requested_render_config: renderConfig,
    // The RPC intentionally accepts null for a new export; generated types lose that nullability.
    target_export_id: input.data.exportId as string,
    target_share_page_id: page.data.id,
  });
  if (error || !data) return { error: imageError(error?.message) };
  const rpcData = data as Record<string, unknown>;
  const enrichedSnapshot = await getPublicItinerary(page.data.publicToken);
  const parsedRenderConfig = longImageRenderConfigSchema.safeParse(rpcData.renderConfig);
  if (!parsedRenderConfig.success) return { error: "The image settings could not be read." };
  const attachmentFreeSnapshot = enrichedSnapshot
    ? {
        ...enrichedSnapshot,
        days: enrichedSnapshot.days.map((day) => ({
          ...day,
          items: day.items.map((item) => {
            const media = item.media?.filter(({ source }) => source !== "attachment");
            return { ...item, media: media?.length ? media : undefined };
          }),
        })),
      }
    : rpcData.sourceSnapshot;
  const parsedSnapshot = publicItinerarySchema.safeParse(attachmentFreeSnapshot);
  if (!parsedSnapshot.success) return { error: "The image snapshot could not be read." };
  let sourceSnapshot;
  try {
    sourceSnapshot = scopePublicItinerary(parsedSnapshot.data, parsedRenderConfig.data.scope);
  } catch (caught) {
    return {
      error: caught instanceof Error ? caught.message : "The image date range is unavailable.",
    };
  }
  const prepared = prepareShareImageSchema.safeParse({
    ...rpcData,
    sourceSnapshot,
    uploadPathPrefix: `${userData.user.id}/${rpcData.exportId}/${rpcData.versionId}`,
  });
  return prepared.success
    ? { data: prepared.data }
    : { error: "The image render request could not be prepared." };
}

export async function finalizeShareImageVersion(rawInput: {
  parts: ShareImagePartInput[];
  versionId: string;
}): Promise<ShareActionResult<{ expiresAt: string; permanentSlug: string; partCount: number }>> {
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
    .object({
      expiresAt: z.string().optional(),
      partCount: z.number().int().positive(),
      permanentSlug: z.string().length(24),
    })
    .passthrough()
    .safeParse(data);
  return error || !parsed.success
    ? { error: imageError(error?.message) }
    : {
        data: {
          expiresAt:
            parsed.data.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
          partCount: parsed.data.partCount,
          permanentSlug: parsed.data.permanentSlug,
        },
      };
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
  const pathsResult = await supabase.rpc("owner_share_image_export_paths_v1", {
    target_export_id: exportId,
  });
  const paths = z.array(z.string().min(1).max(1_000)).max(5_000).safeParse(pathsResult.data);
  if (pathsResult.error || !paths.success) return { error: imageError(pathsResult.error?.message) };
  for (let index = 0; index < paths.data.length; index += 100) {
    const { error } = await supabase.storage
      .from("share-images")
      .remove(paths.data.slice(index, index + 100));
    if (error) return { error: "The stored image could not be deleted. Try again." };
  }
  const { error } = await supabase.rpc("revoke_share_image_export_v1", {
    target_export_id: exportId,
  });
  return error ? { error: imageError(error.message) } : { data: { revoked: true } };
}
