import { z } from "zod";

import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_VIDEO_BYTES } from "../attachments/config.ts";
import { itineraryItemTypes } from "../itinerary/item-schema.ts";
import { publicSavedRouteSchema } from "./public-route-schema.ts";
import { publicTemplateIdSchema, publicTemplateVersionSchema } from "./templates/schema.ts";

export {
  publicOverviewRouteCalculationInputSchema,
  publicRouteCalculationInputSchema,
  publicRouteCalculationSchema,
} from "./public-route-schema.ts";

export const canonicalPublicViews = ["overview", "table", "timeline"] as const;

export const publicViewSchema = z.preprocess(
  (value) => (value === "compact" ? "overview" : value),
  z.enum(canonicalPublicViews),
);

const publicUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Only HTTP(S) links can be shared.");

const publicLinkSchema = z
  .object({ label: z.string().trim().min(1).max(80), url: publicUrlSchema })
  .strict();
const publicMediaUrlSchema = z
  .string()
  .max(2_000)
  .refine((value) => {
    if (value.startsWith("/api/public-place-photo/")) return true;
    return publicUrlSchema.safeParse(value).success;
  }, "Only safe public media URLs can be shared.");
const publicAttachmentUrlSchema = z
  .string()
  .max(500)
  .regex(
    /^\/api\/share\/[0-9a-f-]{36}\/assets\/[0-9a-f]{64}(?:\?variant=thumbnail)?$/,
    "Only the private attachment access route can be shared.",
  );
const publicMediaAttributionSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    url: publicUrlSchema.optional(),
  })
  .strict();
export const publicItemMediaSchema = z.union([
  z
    .object({
      alt: z.string().trim().max(300).optional(),
      attribution: publicMediaAttributionSchema.optional(),
      id: z.string().trim().min(1).max(500),
      kind: z.literal("image"),
      source: z.literal("google_place"),
      sourceUrl: publicUrlSchema.optional(),
      thumbnailUrl: publicMediaUrlSchema.optional(),
      url: publicMediaUrlSchema,
    })
    .strict(),
  z
    .object({
      alt: z.string().trim().max(300).optional(),
      byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
      id: z.string().regex(/^[0-9a-f]{64}$/),
      kind: z.literal("image"),
      label: z.string().trim().min(1).max(240),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      source: z.literal("attachment"),
      thumbnailUrl: publicAttachmentUrlSchema.optional(),
      url: publicAttachmentUrlSchema,
    })
    .strict(),
  z
    .object({
      byteSize: z.number().int().positive().max(MAX_PDF_BYTES),
      id: z.string().regex(/^[0-9a-f]{64}$/),
      kind: z.literal("pdf"),
      label: z.string().trim().min(1).max(240),
      mimeType: z.literal("application/pdf"),
      source: z.literal("attachment"),
      thumbnailUrl: publicAttachmentUrlSchema.optional(),
      url: publicAttachmentUrlSchema,
    })
    .strict(),
  z
    .object({
      byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
      id: z.string().regex(/^[0-9a-f]{64}$/),
      kind: z.literal("video"),
      label: z.string().trim().min(1).max(240),
      mimeType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
      source: z.literal("attachment"),
      thumbnailUrl: publicAttachmentUrlSchema.optional(),
      url: publicAttachmentUrlSchema,
    })
    .strict(),
]);
const publicPlaceSchema = z
  .object({
    address: z.string().max(500).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    displayName: z.string().min(1).max(300),
    googlePlaceId: z.string().trim().min(1).max(300).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    localityName: z.string().min(1).max(300).optional(),
  })
  .strict();
const publicCarRentalSchema = z
  .object({
    action: z.enum(["pickup", "return"]).optional(),
    address: z.string().max(300).optional(),
    company: z.string().max(120).optional(),
  })
  .strict();
const publicTransportSchema = z
  .object({
    destination: z.string().trim().min(1).max(200).optional(),
    origin: z.string().trim().min(1).max(200).optional(),
    serviceNumber: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
const publicItemSchema = z
  .object({
    carRental: publicCarRentalSchema.optional(),
    endTime: z.string().optional(),
    links: z.array(publicLinkSchema).max(20).optional(),
    media: z.array(publicItemMediaSchema).max(12).optional(),
    notes: z.string().max(5000).optional(),
    place: publicPlaceSchema.optional(),
    ref: z.string().length(64),
    scheduleLabel: z.string().max(120).optional(),
    sortOrder: z.number().int(),
    startTime: z.string().optional(),
    title: z.string().min(1).max(200),
    transport: publicTransportSchema.optional(),
    type: z.enum(itineraryItemTypes),
  })
  .strict();
const publicDaySchema = z
  .object({
    city: z.string().max(300).optional(),
    date: z.string().nullable().optional(),
    dayNumber: z.number().int().positive(),
    items: z.array(publicItemSchema),
    localities: z.array(z.string().min(1).max(300)).optional(),
    notes: z.string().max(5000).optional(),
    ref: z.string().length(64),
    primaryLocality: z.string().min(1).max(300).optional(),
    title: z.string().max(200).nullable().optional(),
  })
  .strict();
export const publicItinerarySchema = z
  .object({
    available: z.literal(true),
    citySequence: z.array(
      z
        .object({
          date: z.string().nullable().optional(),
          dayNumber: z.number().int().positive(),
          latitude: z.number().min(-90).max(90).nullable().optional(),
          longitude: z.number().min(-180).max(180).nullable().optional(),
          name: z.string().min(1).max(300),
          ref: z.string().length(64),
        })
        .strict(),
    ),
    days: z.array(publicDaySchema),
    metadata: z
      .object({
        coverCities: z.array(z.string().min(1).max(300)),
        description: z.string().min(1).max(500),
        title: z.string().min(1).max(160),
      })
      .strict(),
    savedRoutes: z.array(publicSavedRouteSchema),
    settings: z
      .object({
        allowRouteExplore: z.boolean(),
        defaultView: publicViewSchema,
        showAddresses: z.boolean(),
        showAttachments: z.boolean().optional().default(false),
        showMapRoutes: z.boolean(),
        showNotes: z.boolean(),
        showPlacePhotos: z.boolean().optional(),
        showQuickActionLinks: z.boolean(),
        showTimes: z.boolean(),
        templateId: publicTemplateIdSchema.optional(),
        templateVersion: publicTemplateVersionSchema.optional(),
      })
      .strict(),
    trip: z
      .object({
        dayCount: z.number().int().positive(),
        endDate: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        timezone: z.string().min(1).max(120),
        title: z.string().min(1).max(120),
      })
      .strict(),
    variant: z
      .object({ color: z.string().regex(/^#[0-9a-f]{6}$/i), name: z.string().min(1).max(80) })
      .strict(),
  })
  .strict();

export const unavailablePublicItinerarySchema = z.object({ available: z.literal(false) }).strict();

export const publicItineraryLinkSchema = z
  .object({
    allowLongImageDownload: z.boolean(),
    allowRouteExplore: z.boolean(),
    createdAt: z.string(),
    defaultView: publicViewSchema,
    id: z.uuid(),
    longImageEndDayNumber: z.number().int().min(1).max(366).nullable(),
    longImageQrDestination: z.enum(["current_share_page", "share_page", "homepage"]),
    longImageQrSharePageId: z.uuid().nullable(),
    longImageStartDayNumber: z.number().int().min(1).max(366).nullable(),
    publishedAt: z.string().nullable(),
    publicToken: z.uuid(),
    shareDescription: z.string().nullable(),
    shareTitle: z.string().nullable(),
    showAddresses: z.boolean(),
    showAttachments: z.boolean(),
    showMapRoutes: z.boolean(),
    showNotes: z.boolean(),
    showPlacePhotos: z.boolean(),
    showQuickActionLinks: z.boolean(),
    showTimes: z.boolean(),
    snapshotHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    sourceAvailable: z.boolean(),
    templateId: publicTemplateIdSchema,
    templateVersion: publicTemplateVersionSchema,
    tripId: z.uuid().nullable(),
    updatedAt: z.string(),
    variantId: z.uuid().nullable(),
  })
  .strict()
  .refine(
    ({ longImageEndDayNumber, longImageStartDayNumber }) =>
      (longImageStartDayNumber === null && longImageEndDayNumber === null) ||
      (longImageStartDayNumber !== null &&
        longImageEndDayNumber !== null &&
        longImageStartDayNumber <= longImageEndDayNumber),
    { message: "The long-image date range is invalid." },
  );

export const publicItinerarySettingsSchema = z
  .object({
    allowLongImageDownload: z.boolean(),
    allowRouteExplore: z.boolean(),
    defaultView: z.enum(canonicalPublicViews),
    longImageEndDayNumber: z.number().int().min(1).max(366).nullable(),
    longImageQrDestination: z.enum(["current_share_page", "share_page", "homepage"]),
    longImageQrSharePageId: z.uuid().nullable(),
    longImageStartDayNumber: z.number().int().min(1).max(366).nullable(),
    shareDescription: z.string().trim().max(500),
    shareTitle: z.string().trim().max(160),
    showAddresses: z.boolean(),
    showAttachments: z.boolean(),
    showMapRoutes: z.boolean(),
    showNotes: z.boolean(),
    showPlacePhotos: z.boolean(),
    showQuickActionLinks: z.boolean(),
    showTimes: z.boolean(),
    templateId: publicTemplateIdSchema,
    templateVersion: publicTemplateVersionSchema,
    variantId: z.uuid(),
  })
  .strict()
  .refine(
    ({ longImageEndDayNumber, longImageStartDayNumber }) =>
      (longImageStartDayNumber === null && longImageEndDayNumber === null) ||
      (longImageStartDayNumber !== null &&
        longImageEndDayNumber !== null &&
        longImageStartDayNumber <= longImageEndDayNumber),
    { message: "Choose a valid long-image date range." },
  );

export const linkMutationSchema = z.object({ linkId: z.uuid(), tripId: z.uuid() }).strict();

export type PublicItinerarySettingsInput = z.infer<typeof publicItinerarySettingsSchema>;
