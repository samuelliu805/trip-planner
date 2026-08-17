export const MAX_ATTACHMENTS_PER_ITEM = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
export const MAX_ITEM_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_OWNER_ASSET_BYTES = 250 * 1024 * 1024;
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
export const ATTACHMENT_BUCKET = "trip-assets";

export const attachmentKinds = ["image", "pdf", "video"] as const;
export type AttachmentKind = (typeof attachmentKinds)[number];

export const attachmentMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;
export type AttachmentMimeType = (typeof attachmentMimeTypes)[number];

export const ATTACHMENT_ACCEPT = attachmentMimeTypes.join(",");

export const attachmentLimits: Record<AttachmentKind, number> = {
  image: MAX_IMAGE_BYTES,
  pdf: MAX_PDF_BYTES,
  video: MAX_VIDEO_BYTES,
};

export const attachmentMimeTypesByKind: Record<AttachmentKind, readonly AttachmentMimeType[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  pdf: ["application/pdf"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

export function attachmentLimitMessage(kind: AttachmentKind) {
  const labels: Record<AttachmentKind, string> = { image: "Image", pdf: "PDF", video: "Video" };
  return `${labels[kind]} files must be ${formatBytes(attachmentLimits[kind])} or smaller.`;
}

export const attachmentAcceptedTypeCopy =
  "JPEG, PNG, or WebP up to 10 MB; PDF up to 20 MB; MP4, WebM, or MOV up to 30 MB.";
