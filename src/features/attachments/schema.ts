import { z } from "zod";

import {
  MAX_VIDEO_BYTES,
  attachmentKinds,
  attachmentLimitMessage,
  attachmentLimits,
  attachmentMimeTypes,
  attachmentMimeTypesByKind,
} from "./config.ts";

export const ownerAttachmentSchema = z
  .object({
    byteSize: z.number().int().positive(),
    createdAt: z.string(),
    draft: z.boolean(),
    durationSeconds: z.number().nonnegative().nullable(),
    fileName: z.string().trim().min(1).max(240),
    height: z.number().int().positive().nullable(),
    id: z.uuid(),
    includeInShare: z.boolean(),
    kind: z.enum(attachmentKinds),
    mimeType: z.enum(attachmentMimeTypes),
    publicRef: z.string().regex(/^[0-9a-f]{64}$/),
    sortOrder: z.number().int().min(0).max(4),
    status: z.enum(["pending", "ready", "failed", "deleting"]),
    width: z.number().int().positive().nullable(),
  })
  .strict();

export type OwnerAttachment = z.infer<typeof ownerAttachmentSchema>;

export const prepareAttachmentInputSchema = z
  .object({
    byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Remove control characters."),
    kind: z.enum(attachmentKinds),
    mimeType: z.enum(attachmentMimeTypes),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    uploadSessionId: z.uuid(),
    operationId: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!attachmentMimeTypesByKind[value.kind].includes(value.mimeType))
      context.addIssue({
        code: "custom",
        message: "The declared attachment type does not match its media category.",
        path: ["mimeType"],
      });
    if (value.byteSize > attachmentLimits[value.kind])
      context.addIssue({
        code: "too_big",
        inclusive: true,
        maximum: attachmentLimits[value.kind],
        message: attachmentLimitMessage(value.kind),
        origin: "number",
        path: ["byteSize"],
      });
  });

const signedUploadSchema = z
  .object({
    bucket: z.literal("trip-assets"),
    objectKey: z.string().min(1).max(500),
    signedUrl: z.url(),
    token: z.string().min(1),
    tusEndpoint: z.url(),
  })
  .strict();

export const preparedAttachmentSchema = z
  .object({
    assetId: z.uuid(),
    attachment: ownerAttachmentSchema,
    duplicate: z.boolean(),
    expiresAt: z.string().optional(),
    posterUpload: signedUploadSchema.optional(),
    upload: signedUploadSchema.optional(),
    uploadRequired: z.boolean(),
  })
  .strict();

export const preparedAssetReservationSchema = z
  .object({
    assetId: z.uuid(),
    attachment: ownerAttachmentSchema,
    duplicate: z.boolean(),
    expiresAt: z.string().optional(),
    objectKey: z.string().min(1).max(500).optional(),
    thumbnailObjectKey: z.string().min(1).max(500).nullable().optional(),
    uploadRequired: z.boolean(),
  })
  .strict();

export const finalizedAttachmentSchema = z
  .object({ attachment: ownerAttachmentSchema, deduplicated: z.boolean() })
  .strict();

export const attachmentSessionSchema = z.array(ownerAttachmentSchema).max(5);

export const assetAccessSchema = z
  .object({
    bucket: z.literal("trip-assets"),
    byteSize: z.number().int().positive(),
    fileName: z.string().min(1).max(240),
    kind: z.enum(attachmentKinds),
    mimeType: z.enum(attachmentMimeTypes),
    objectKey: z.string().min(1).max(500),
    thumbnailObjectKey: z.string().min(1).max(500).nullable(),
  })
  .strict();

export function attachmentError(message?: string) {
  if (message?.includes("ATTACHMENT_DUPLICATE")) return "This file is already attached here.";
  if (message?.includes("ATTACHMENT_COUNT_LIMIT"))
    return "This saved item already has five attachments.";
  if (message?.includes("ATTACHMENT_ITEM_BYTES_LIMIT"))
    return "This saved item would exceed its 50 MB attachment limit.";
  if (message?.includes("ATTACHMENT_OWNER_BYTES_LIMIT"))
    return "Your stored trip attachments would exceed the 250 MB account limit.";
  if (message?.includes("ATTACHMENT_TYPE_UNSUPPORTED"))
    return "Use a JPEG, PNG, WebP, PDF, MP4, WebM, or QuickTime/MOV file. HEIC is not supported yet.";
  if (message?.includes("ATTACHMENT_FILE_BYTES_LIMIT"))
    return "This file exceeds the allowed size for its type.";
  if (message?.match(/OWNER|permission|row-level security/i))
    return "Only the trip owner can manage attachments.";
  return "The attachment could not be changed. Please try again.";
}
