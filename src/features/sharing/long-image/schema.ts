import { z } from "zod";

import { publicItinerarySchema } from "../schema";

const imageDestinationUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "http:" || url.protocol === "https:";
}, "Only HTTP(S) destinations can be encoded.");

export const shareImageManifestSchema = z
  .object({
    available: z.literal(true),
    parts: z.array(
      z
        .object({
          byteSize: z.number().int().positive(),
          checksum: z.string().regex(/^[0-9a-f]{64}$/),
          contentType: z.literal("image/jpeg"),
          height: z.number().int().min(320).max(12_000),
          partNumber: z.number().int().positive(),
          storagePath: z.string().min(1).max(1_000),
          width: z.literal(1080),
        })
        .strict(),
    ),
    permanentSlug: z.string().regex(/^[0-9a-f]{24}$/),
    qrDestinationType: z.enum(["share_page", "homepage"]),
    title: z.string().min(1).max(160),
    versionNumber: z.number().int().positive(),
  })
  .strict();

export const ownerShareImageStateSchema = z
  .object({
    createdAt: z.string(),
    exportId: z.uuid(),
    partCount: z.number().int().positive(),
    permanentSlug: z.string().regex(/^[0-9a-f]{24}$/),
    sourceSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    updatedAt: z.string(),
    versionNumber: z.number().int().positive(),
  })
  .strict();

export const prepareShareImageSchema = z
  .object({
    exportId: z.uuid(),
    permanentSlug: z.string().regex(/^[0-9a-f]{24}$/),
    qrDestinationType: z.enum(["share_page", "homepage"]),
    qrDestinationUrl: imageDestinationUrlSchema,
    renderConfig: z
      .object({
        renderer: z.literal("timeline"),
        version: z.literal(1),
      })
      .passthrough(),
    sourceSnapshot: publicItinerarySchema,
    sourceSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    uploadPathPrefix: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
  })
  .strict();

export const shareImagePartInputSchema = z
  .object({
    byteSize: z.number().int().positive().max(10_485_760),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    contentType: z.literal("image/jpeg"),
    height: z.number().int().min(320).max(12_000),
    partNumber: z.number().int().positive().max(20),
    storagePath: z.string().min(1).max(1_000),
    width: z.literal(1080),
  })
  .strict();
