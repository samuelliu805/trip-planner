import { z } from "zod";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import {
  attachmentError,
  prepareAttachmentInputSchema,
  preparedAssetReservationSchema,
} from "@/features/attachments/schema";
import { createSignedAssetUpload } from "@/features/attachments/storage.server";
import { createClient } from "@/lib/supabase/server";
import { reportAttachmentMutation } from "@/features/attachments/telemetry.server";

const paramsSchema = z.object({ researchItemId: z.uuid(), tripId: z.uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ researchItemId: string; tripId: string }> },
) {
  const [routeParams, body] = await Promise.all([
    paramsSchema.safeParseAsync(await params),
    request.json().catch(() => null),
  ]);
  const input = prepareAttachmentInputSchema.safeParse(body);
  if (!routeParams.success || !input.success)
    return Response.json({ error: "Review the selected attachment." }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user)
    return Response.json({ error: "Sign in to add attachments." }, { status: 401 });

  const result = await supabase.rpc("prepare_research_asset_v1", {
    requested_byte_size: input.data.byteSize,
    requested_draft_session_id: input.data.uploadSessionId,
    requested_filename: input.data.fileName,
    requested_media_kind: input.data.kind,
    requested_mime_type: input.data.mimeType,
    requested_sha256: input.data.sha256,
    target_research_item_id: routeParams.data.researchItemId,
    target_trip_id: routeParams.data.tripId,
  });
  const reservation = preparedAssetReservationSchema.safeParse(result.data);
  if (result.error || !reservation.success) {
    await reportAttachmentMutation({
      mutation: "upload",
      operationId: input.data.operationId,
      result: { error: attachmentError(result.error?.message) },
      supabaseUserId: authData.user.id,
      target: "research",
    });
    return Response.json(
      { error: attachmentError(result.error?.message), failureReported: true },
      { status: 400 },
    );
  }

  if (!reservation.data.uploadRequired) {
    await reportAttachmentMutation({
      mutation: "upload",
      operationId: input.data.operationId,
      result: { data: true },
      supabaseUserId: authData.user.id,
      target: "research",
    });
    return Response.json(
      {
        assetId: reservation.data.assetId,
        attachment: reservation.data.attachment,
        duplicate: reservation.data.duplicate,
        expiresAt: reservation.data.expiresAt,
        uploadRequired: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const assetId = reservation.data.assetId;
  const operationId = input.data.operationId;
  const userId = authData.user.id;
  async function failReservation(reason: string) {
    await supabase.rpc("fail_item_asset_v1", {
      requested_reason: reason,
      target_asset_id: assetId,
    });
    await drainAssetDeletionQueue(10);
    await reportAttachmentMutation({
      mutation: "upload",
      operationId,
      result: { error: reason },
      supabaseUserId: userId,
      target: "research",
    });
    return Response.json({ error: reason, failureReported: true }, { status: 500 });
  }
  if (!reservation.data.objectKey)
    return failReservation("The private upload path is unavailable.");

  try {
    const upload = await createSignedAssetUpload(reservation.data.objectKey);
    const posterUpload =
      input.data.kind === "video" && reservation.data.thumbnailObjectKey
        ? await createSignedAssetUpload(reservation.data.thumbnailObjectKey)
        : undefined;
    return Response.json(
      {
        assetId: reservation.data.assetId,
        attachment: reservation.data.attachment,
        duplicate: reservation.data.duplicate,
        expiresAt: reservation.data.expiresAt,
        posterUpload,
        upload,
        uploadRequired: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failReservation(error instanceof Error ? error.message : "Upload authorization failed.");
  }
}
