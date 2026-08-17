import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseConfig } from "@/lib/supabase/config";

import { ATTACHMENT_BUCKET, MAX_IMAGE_BYTES } from "./config";
import { detectAttachmentType } from "./file-signature";

export function attachmentSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyAttachmentBytes(bytes: Uint8Array) {
  const detected = detectAttachmentType(bytes);
  if (!detected)
    throw new Error(
      "The stored file is not a supported JPEG, PNG, WebP, PDF, MP4, WebM, or QuickTime/MOV file.",
    );
  return detected;
}

export async function createImageThumbnail(bytes: Uint8Array) {
  const pipeline = sharp(bytes, { failOn: "warning", limitInputPixels: 80_000_000 }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) throw new Error("The image dimensions are invalid.");
  const thumbnail = await pipeline
    .resize({ fit: "inside", height: 480, width: 480, withoutEnlargement: true })
    .webp({ effort: 4, quality: 78 })
    .toBuffer();
  if (thumbnail.byteLength > MAX_IMAGE_BYTES)
    throw new Error("The generated image preview is too large.");
  return { height: metadata.height, thumbnail, width: metadata.width };
}

export async function verifyStoredPoster(objectKey: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(ATTACHMENT_BUCKET).download(objectKey);
  if (error || !data) return false;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return (
    bytes.byteLength <= 2 * 1024 * 1024 && detectAttachmentType(bytes)?.mimeType === "image/webp"
  );
}

export async function createSignedAssetUpload(objectKey: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUploadUrl(objectKey, { upsert: false });
  if (error || !data) throw new Error("A private upload authorization could not be created.");
  const { url } = getSupabaseConfig();
  const projectUrl = new URL(url);
  const projectRef = projectUrl.hostname.match(/^([^.]+)\.supabase\.co$/)?.[1];
  const storageOrigin = projectRef
    ? `${projectUrl.protocol}//${projectRef}.storage.supabase.co`
    : projectUrl.origin;
  return {
    bucket: ATTACHMENT_BUCKET as typeof ATTACHMENT_BUCKET,
    objectKey,
    signedUrl: data.signedUrl,
    token: data.token,
    tusEndpoint: `${storageOrigin}/storage/v1/upload/resumable`,
  };
}

export async function createAssetAccessRedirect({
  download,
  fileName,
  objectKey,
}: {
  download: boolean;
  fileName: string;
  objectKey: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(objectKey, 60, download ? { download: fileName } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}
