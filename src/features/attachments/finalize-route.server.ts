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
import {
  getAuthProvider,
  getBackendCapabilities,
  getPrivilegedRelationalDatabase,
  getRelationalDatabase,
  getStorageProvider,
} from "@/platform/composition/server";
import { reportAttachmentMutation } from "@/features/attachments/telemetry.server";

const finalizeBodySchema = z
  .object({ operationId: z.uuid().optional(), posterUploaded: z.boolean().default(false) })
  .strict();
const deleteBodySchema = z
  .object({ failure: z.boolean().default(false), operationId: z.uuid().optional() })
  .strict();

type AttachmentRouteTarget =
  { itemId: string; researchItemId?: never } | { itemId?: never; researchItemId: string };

type AttachmentRoute = AttachmentRouteTarget & { assetId: string; tripId: string };

const attachmentTarget = (route: AttachmentRoute) =>
  route.researchItemId ? ("research" as const) : ("itinerary" as const);

export async function deleteAttachmentUpload(request: Request, route: AttachmentRoute) {
  if (!getBackendCapabilities().signedUrls) return new Response(null, { status: 404 });
  const body = deleteBodySchema.safeParse(await request.json().catch(() => ({})));
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const database = await getRelationalDatabase();
  const { error } = await database.rpc("fail_item_asset_v1", {
    requested_reason: "Upload canceled or interrupted",
    target_asset_id: route.assetId,
  });
  if (error) {
    if (body.success && body.data.failure)
      await reportAttachmentMutation({
        mutation: "upload",
        operationId: body.data.operationId,
        result: { error: attachmentError(error.message) },
        appUserId: user.id,
        target: attachmentTarget(route),
      });
    return Response.json(
      { error: attachmentError(error.message), failureReported: body.success && body.data.failure },
      { status: 400 },
    );
  }
  if (body.success && body.data.failure)
    await reportAttachmentMutation({
      mutation: "upload",
      operationId: body.data.operationId,
      result: { error: "The attachment could not be changed. Please try again." },
      appUserId: user.id,
      target: attachmentTarget(route),
    });
  await drainAssetDeletionQueue(10);
  return new Response(null, { status: 204 });
}

export async function finalizeAttachmentUpload(request: Request, route: AttachmentRoute) {
  if (!getBackendCapabilities().signedUrls) return new Response(null, { status: 404 });
  const rawBody = await request.json().catch(() => ({}));
  const body = finalizeBodySchema.safeParse(rawBody);
  if (!body.success)
    return Response.json({ error: "The finalize request is invalid." }, { status: 400 });
  const operationId = body.data.operationId;

  const user = await getAuthProvider().getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to finish this upload." }, { status: 401 });
  const userId = user.id;
  const database = await getRelationalDatabase();

  const admin = getPrivilegedRelationalDatabase();
  const storage = getStorageProvider(ATTACHMENT_BUCKET);
  let linkQuery = admin
    .from("asset_links")
    .select("id")
    .eq("asset_id", route.assetId)
    .eq("trip_id", route.tripId)
    .eq("owner_id", userId);
  if (route.researchItemId) linkQuery = linkQuery.eq("research_item_id", route.researchItemId);
  else if (route.itemId) linkQuery = linkQuery.eq("itinerary_item_id", route.itemId);
  const [{ data: asset }, { data: link }] = await Promise.all([
    admin.from("assets").select("*").eq("id", route.assetId).eq("owner_id", userId).maybeSingle(),
    linkQuery.maybeSingle(),
  ]);
  if (!asset || !link)
    return Response.json(
      { error: "The attachment target is no longer available." },
      { status: 404 },
    );

  async function fail(reason: string, status = 400) {
    await database.rpc("fail_item_asset_v1", {
      requested_reason: reason,
      target_asset_id: route.assetId,
    });
    await drainAssetDeletionQueue(10);
    await reportAttachmentMutation({
      mutation: "upload",
      operationId,
      result: { error: reason },
      appUserId: userId,
      target: attachmentTarget(route),
    });
    return Response.json({ error: reason, failureReported: true }, { status });
  }

  if (asset.status !== "pending" && asset.status !== "ready")
    return fail("This upload can no longer be finalized.", 409);

  let bytes: Uint8Array;
  try {
    const downloaded = await storage.download(asset.object_key);
    bytes = new Uint8Array(await downloaded.arrayBuffer());
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
      await storage.upload({
        body: generated.thumbnail,
        cacheControl: "3600",
        contentType: "image/webp",
        path: asset.thumbnail_object_key,
        upsert: true,
      });
      thumbnailReady = true;
    } catch {
      return fail("A safe image preview could not be generated.");
    }
  } else if (detected.kind === "video" && body.data.posterUploaded && asset.thumbnail_object_key) {
    thumbnailReady = await verifyStoredPoster(asset.thumbnail_object_key);
    if (!thumbnailReady) await storage.remove([asset.thumbnail_object_key]);
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
  const finalizeRpc = route.researchItemId
    ? "finalize_research_asset_v1"
    : "finalize_item_asset_v2";
  let result = await database.rpc(finalizeRpc, rpcInput);
  if (result.error?.message.includes("ATTACHMENT_FINALIZE_CONFLICT"))
    result = await database.rpc(finalizeRpc, rpcInput);
  const finalized = finalizedAttachmentSchema.safeParse(result.data);
  if (result.error || !finalized.success) return fail(attachmentError(result.error?.message), 409);

  if (finalized.data.deduplicated) await drainAssetDeletionQueue(10);
  await reportAttachmentMutation({
    mutation: "upload",
    operationId,
    result: { data: true },
    appUserId: userId,
    target: attachmentTarget(route),
  });
  return Response.json(finalized.data, { headers: { "Cache-Control": "no-store" } });
}
