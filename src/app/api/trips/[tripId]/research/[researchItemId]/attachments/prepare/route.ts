import { z } from "zod";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import {
  attachmentError,
  prepareAttachmentInputSchema,
  preparedAssetReservationSchema,
} from "@/features/attachments/schema";
import { createSignedAssetUpload } from "@/features/attachments/storage.server";
import { createClient } from "@/lib/supabase/server";

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
  if (result.error || !reservation.success)
    return Response.json({ error: attachmentError(result.error?.message) }, { status: 400 });

  if (!reservation.data.uploadRequired)
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
  if (!reservation.data.objectKey)
    return Response.json({ error: "The private upload path is unavailable." }, { status: 500 });

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
    await supabase.rpc("fail_item_asset_v1", {
      requested_reason: error instanceof Error ? error.message : "Upload authorization failed",
      target_asset_id: reservation.data.assetId,
    });
    await drainAssetDeletionQueue(10);
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload authorization failed." },
      { status: 500 },
    );
  }
}
