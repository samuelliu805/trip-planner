import { z } from "zod";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { ATTACHMENT_BUCKET } from "@/features/attachments/config";
import { attachmentError, finalizedAttachmentSchema } from "@/features/attachments/schema";
import {
  attachmentSha256,
  createImageThumbnail,
  verifyAttachmentBytes,
  verifyStoredPoster,
} from "@/features/attachments/storage.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ assetId: z.uuid(), itemId: z.uuid(), tripId: z.uuid() });
const finalizeBodySchema = z.object({ posterUploaded: z.boolean().default(false) }).strict();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ assetId: string; itemId: string; tripId: string }> },
) {
  const route = paramsSchema.safeParse(await params);
  if (!route.success) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return new Response(null, { status: 401 });
  const { error } = await supabase.rpc("fail_item_asset_v1", {
    requested_reason: "Upload canceled or interrupted",
    target_asset_id: route.data.assetId,
  });
  if (error) return Response.json({ error: attachmentError(error.message) }, { status: 400 });
  await drainAssetDeletionQueue(10);
  return new Response(null, { status: 204 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string; itemId: string; tripId: string }> },
) {
  const [routeParams, rawBody] = await Promise.all([
    paramsSchema.safeParseAsync(await params),
    request.json().catch(() => ({})),
  ]);
  const body = finalizeBodySchema.safeParse(rawBody);
  if (!routeParams.success || !body.success)
    return Response.json({ error: "The finalize request is invalid." }, { status: 400 });
  const route = routeParams.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user)
    return Response.json({ error: "Sign in to finish this upload." }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: asset }, { data: link }] = await Promise.all([
    admin
      .from("assets")
      .select("*")
      .eq("id", route.assetId)
      .eq("owner_id", authData.user.id)
      .maybeSingle(),
    admin
      .from("asset_links")
      .select("id")
      .eq("asset_id", route.assetId)
      .eq("trip_id", route.tripId)
      .eq("itinerary_item_id", route.itemId)
      .eq("owner_id", authData.user.id)
      .maybeSingle(),
  ]);
  if (!asset || !link)
    return Response.json({ error: "The itinerary item is no longer available." }, { status: 404 });

  async function fail(reason: string, status = 400) {
    await supabase.rpc("fail_item_asset_v1", {
      requested_reason: reason,
      target_asset_id: route.assetId,
    });
    await drainAssetDeletionQueue(10);
    return Response.json({ error: reason }, { status });
  }

  if (asset.status !== "pending" && asset.status !== "ready")
    return fail("This upload can no longer be finalized.", 409);

  let bytes: Uint8Array;
  try {
    const downloaded = await admin.storage.from(ATTACHMENT_BUCKET).download(asset.object_key);
    if (downloaded.error || !downloaded.data)
      return fail("The uploaded file is incomplete. Retry the upload.");
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  } catch {
    return fail("The uploaded file could not be verified. Retry the upload.");
  }

  const actualHash = attachmentSha256(bytes);
  if (bytes.byteLength !== asset.byte_size)
    return fail("The uploaded byte count does not match the selected file.");
  if (actualHash !== asset.sha256)
    return fail("The uploaded file changed during transfer. Select it again and retry.");

  let detected;
  try {
    detected = verifyAttachmentBytes(bytes);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The file type is not supported.");
  }
  if (detected.kind !== asset.media_kind)
    return fail("The uploaded file content does not match its declared type.");

  let width: number | null = null;
  let height: number | null = null;
  let thumbnailReady = false;
  if (detected.kind === "image") {
    if (!asset.thumbnail_object_key) return fail("The image preview path is unavailable.", 500);
    try {
      const generated = await createImageThumbnail(bytes);
      width = generated.width;
      height = generated.height;
      const upload = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .upload(asset.thumbnail_object_key, generated.thumbnail, {
          cacheControl: "3600",
          contentType: "image/webp",
          upsert: true,
        });
      if (upload.error) throw upload.error;
      thumbnailReady = true;
    } catch {
      return fail("A safe image preview could not be generated.");
    }
  } else if (detected.kind === "video" && body.data.posterUploaded && asset.thumbnail_object_key) {
    thumbnailReady = await verifyStoredPoster(asset.thumbnail_object_key);
    if (!thumbnailReady)
      await admin.storage.from(ATTACHMENT_BUCKET).remove([asset.thumbnail_object_key]);
  }

  const rpcInput = {
    target_asset_id: asset.id,
    thumbnail_ready: thumbnailReady,
    verified_byte_size: bytes.byteLength,
    ...(height === null ? {} : { verified_height: height }),
    verified_media_kind: detected.kind,
    verified_mime_type: detected.mimeType,
    verified_sha256: actualHash,
    ...(width === null ? {} : { verified_width: width }),
  };
  let result = await supabase.rpc("finalize_item_asset_v2", rpcInput);
  if (result.error?.message.includes("ATTACHMENT_FINALIZE_CONFLICT"))
    result = await supabase.rpc("finalize_item_asset_v2", rpcInput);
  const finalized = finalizedAttachmentSchema.safeParse(result.data);
  if (result.error || !finalized.success) return fail(attachmentError(result.error?.message), 409);

  if (finalized.data.deduplicated) await drainAssetDeletionQueue(10);
  return Response.json(finalized.data, { headers: { "Cache-Control": "no-store" } });
}
