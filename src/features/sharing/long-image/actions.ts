"use server";

import { z } from "zod";

import { supportedLocales } from "@/features/i18n/config";
import {
  getAuthProvider,
  getBackendCapabilities,
  getRelationalDatabase,
  getStorageProvider,
} from "@/platform/composition/server";

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
import { reportShareExportStarted, reportSharingMutation } from "../telemetry.server";

const prepareImageInputSchema = z
  .object({
    exportId: z.uuid().nullable(),
    locale: z.enum(supportedLocales),
    mode: z.enum(["new_export", "replace_existing"]),
    sharePageId: z.uuid(),
    scope: longImageScopeSchema.optional(),
    operationId: z.uuid().optional(),
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
  if (!getBackendCapabilities().signedUrls)
    return { error: "Permanent image exports are not supported by this backend." };
  const input = prepareImageInputSchema.safeParse(rawInput);
  if (!input.success) return { error: "Review the image version request." };
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: "Sign in to generate a permanent image." };
  const database = await getRelationalDatabase();
  const pageResult = await database.rpc("owner_share_page_v2", {
    target_share_page_id: input.data.sharePageId,
  });
  if (pageResult.error) return { error: imageError(pageResult.error.message) };
  const page = publicItineraryLinkSchema.safeParse(pageResult.data);
  if (!page.success) return { error: "The Share Page could not be read." };
  const exportMode = input.data.mode === "replace_existing" ? "replace" : "new";
  await reportShareExportStarted({
    exportMode,
    operationId: input.data.operationId,
    appUserId: user.id,
  });
  const failPreparation = (error: string) =>
    reportSharingMutation({
      artifact: "image",
      exportMode,
      mutation: "export",
      operationId: input.data.operationId,
      result: { error },
      appUserId: user.id,
    });
  try {
    let destinationPage = page.data;
    if (page.data.longImageQrDestination === "share_page") {
      const destinationResult = page.data.longImageQrSharePageId
        ? await database.rpc("owner_share_page_v2", {
            target_share_page_id: page.data.longImageQrSharePageId,
          })
        : { data: null, error: null };
      const destination = publicItineraryLinkSchema.safeParse(destinationResult.data);
      if (!destination.success)
        return failPreparation("Choose an active Share Page for the QR code.");
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
      locale: input.data.locale,
      renderer: "timeline" as const,
      scope: input.data.scope ?? longImageScopeFromPage(page.data),
      version: 1 as const,
      width: 1080 as const,
    };
    const { data, error } = await database.rpc("prepare_share_image_version_v2", {
      requested_mode: input.data.mode,
      requested_qr_destination_type: qrDestinationType,
      requested_qr_destination_url: qrDestinationUrl,
      requested_render_config: renderConfig,
      // The RPC intentionally accepts null for a new export; generated types lose that nullability.
      target_export_id: input.data.exportId as string,
      target_share_page_id: page.data.id,
    });
    if (error || !data) return failPreparation(imageError(error?.message));
    const rpcData = data as Record<string, unknown>;
    const enrichedSnapshot = await getPublicItinerary(page.data.publicToken);
    const parsedRenderConfig = longImageRenderConfigSchema.safeParse(rpcData.renderConfig);
    if (!parsedRenderConfig.success)
      return failPreparation("The image settings could not be read.");
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
    if (!parsedSnapshot.success) return failPreparation("The image snapshot could not be read.");
    let sourceSnapshot;
    try {
      sourceSnapshot = scopePublicItinerary(parsedSnapshot.data, parsedRenderConfig.data.scope);
    } catch (caught) {
      return failPreparation(
        caught instanceof Error ? caught.message : "The image date range is unavailable.",
      );
    }
    const prepared = prepareShareImageSchema.safeParse({
      ...rpcData,
      sourceSnapshot,
      uploadPathPrefix: `${user.id}/${rpcData.exportId}/${rpcData.versionId}`,
    });
    return prepared.success
      ? { data: prepared.data }
      : failPreparation("The image render request could not be prepared.");
  } catch (caught) {
    return failPreparation(imageError(caught instanceof Error ? caught.message : undefined));
  }
}

export async function finalizeShareImageVersion(rawInput: {
  exportMode?: "new" | "replace";
  operationId?: string;
  parts: ShareImagePartInput[];
  versionId: string;
}): Promise<ShareActionResult<{ expiresAt: string; permanentSlug: string; partCount: number }>> {
  if (!getBackendCapabilities().signedUrls)
    return { error: "Permanent image exports are not supported by this backend." };
  const input = z
    .object({
      exportMode: z.enum(["new", "replace"]).optional(),
      operationId: z.uuid().optional(),
      parts: shareImagePartInputSchema.array().min(1).max(20),
      versionId: z.uuid(),
    })
    .strict()
    .safeParse(rawInput);
  if (!input.success) return { error: "The rendered image parts are invalid." };
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: "Sign in to publish a permanent image." };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("finalize_share_image_version_v1", {
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
  if (error || !parsed.success) return { error: imageError(error?.message) };
  const result = {
    data: {
      expiresAt:
        parsed.data.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
      partCount: parsed.data.partCount,
      permanentSlug: parsed.data.permanentSlug,
    },
  };
  return reportSharingMutation({
    artifact: "image",
    exportMode: input.data.exportMode,
    mutation: "export",
    operationId: input.data.operationId,
    result,
    appUserId: user.id,
  });
}

export async function failShareImageVersion(
  versionId: string,
  message: string,
  operationId?: string,
  exportMode?: "new" | "replace",
) {
  if (!z.uuid().safeParse(versionId).success) return;
  if (!getBackendCapabilities().signedUrls) return;
  let failureMessage = "Timeline export failed.";
  let appUserId: string | undefined;
  try {
    const user = await getAuthProvider().getCurrentUser();
    if (!user) return;
    appUserId = user.id;
    const database = await getRelationalDatabase();
    const { error } = await database.rpc("fail_share_image_version_v1", {
      requested_error_message: message,
      target_version_id: versionId,
    });
    failureMessage = error?.message ?? failureMessage;
  } catch {
    // State cleanup failure must not suppress the authoritative telemetry outcome.
  }
  await reportSharingMutation({
    artifact: "image",
    exportMode,
    mutation: "export",
    operationId,
    result: { error: failureMessage },
    appUserId,
  });
}

export async function revokeShareImageExport(
  exportId: string,
  operationId?: string,
): Promise<ShareActionResult<{ revoked: true }>> {
  if (!getBackendCapabilities().signedUrls)
    return { error: "Permanent image exports are not supported by this backend." };
  if (!z.uuid().safeParse(exportId).success) return { error: "The image link is invalid." };
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: "Sign in to revoke a permanent image." };
  const database = await getRelationalDatabase();
  const pathsResult = await database.rpc("owner_share_image_export_paths_v1", {
    target_export_id: exportId,
  });
  const paths = z.array(z.string().min(1).max(1_000)).max(5_000).safeParse(pathsResult.data);
  if (pathsResult.error || !paths.success)
    return reportSharingMutation({
      artifact: "image",
      mutation: "revoke",
      operationId,
      result: { error: imageError(pathsResult.error?.message) },
    });
  for (let index = 0; index < paths.data.length; index += 100) {
    try {
      await getStorageProvider("share-images").remove(paths.data.slice(index, index + 100));
    } catch {
      return reportSharingMutation({
        artifact: "image",
        mutation: "revoke",
        operationId,
        result: { error: "The stored image could not be deleted. Try again." },
      });
    }
  }
  const { error } = await database.rpc("revoke_share_image_export_v1", {
    target_export_id: exportId,
  });
  return reportSharingMutation({
    artifact: "image",
    mutation: "revoke",
    operationId,
    result: error ? { error: imageError(error.message) } : { data: { revoked: true as const } },
  });
}
