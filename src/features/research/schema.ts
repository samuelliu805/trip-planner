import { z } from "zod";

import { placeSnapshotSchema } from "../itinerary/item-schema.ts";

import { researchCategories } from "./types.ts";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .url("Enter a complete http:// or https:// link.")
  .refine((value) => /^https?:\/\//i.test(value), "Enter a complete http:// or https:// link.")
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((value) => value || null);

const optionalUuid = z.uuid().optional().nullable();
const optionalTime = z
  .union([z.literal(""), z.iso.time({ precision: -1 })])
  .optional()
  .nullable()
  .transform((value) => value || null);

export const researchSegmentSchema = z.object({
  arrivalDate: z.iso.date().optional().nullable(),
  arrivalTime: optionalTime,
  departureDate: z.iso.date(),
  departureTime: optionalTime,
  destination: z.string().trim().min(1, "Add the segment destination.").max(200),
  origin: z.string().trim().min(1, "Add the segment origin.").max(200),
  serviceNumber: optionalText(80),
});

export const researchLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "Use an http:// or https:// link."),
});

const researchItemFields = {
  category: z.enum(researchCategories),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Choose a three-letter currency.")
    .optional()
    .nullable(),
  dayId: optionalUuid,
  destinationText: optionalText(200),
  destinationPlaceId: optionalUuid,
  destinationPlaceSnapshot: placeSnapshotSchema.optional().nullable(),
  endDate: z.iso.date().optional().nullable(),
  endTime: optionalTime,
  itemId: optionalUuid,
  journeyType: z.enum(["one_way", "round_trip", "multi_city"]).optional().nullable(),
  links: z.array(researchLinkSchema).max(12).optional().default([]),
  locationText: optionalText(200),
  locationPlaceId: optionalUuid,
  locationPlaceSnapshot: placeSnapshotSchema.optional().nullable(),
  note: optionalText(5000),
  originText: optionalText(200),
  originPlaceId: optionalUuid,
  originPlaceSnapshot: placeSnapshotSchema.optional().nullable(),
  segments: z.array(researchSegmentSchema).max(12).optional().default([]),
  sourceUrl: optionalUrl,
  startDate: z.iso.date().optional().nullable(),
  startTime: optionalTime,
  title: optionalText(300),
  totalPriceAmount: z.number().min(0).max(9_999_999_999.99).optional().nullable(),
  tripId: z.uuid(),
};

function validateResearchItem(
  value: {
    currency?: string | null;
    endDate?: string | null;
    note?: string | null;
    sourceUrl?: string | null;
    startDate?: string | null;
    title?: string | null;
    totalPriceAmount?: number | null;
    segments?: Array<{ arrivalDate?: string | null; departureDate: string }>;
  },
  context: z.RefinementCtx,
) {
  if (!value.title && !value.sourceUrl && !value.note)
    context.addIssue({
      code: "custom",
      message: "Add a name, link, or note.",
      path: ["title"],
    });
  if (value.totalPriceAmount !== null && value.totalPriceAmount !== undefined && !value.currency)
    context.addIssue({ code: "custom", message: "Choose a currency.", path: ["currency"] });
  if (value.endDate && value.startDate && value.endDate < value.startDate)
    context.addIssue({
      code: "custom",
      message: "The end date must be on or after the start date.",
      path: ["endDate"],
    });
  for (const [index, segment] of (value.segments ?? []).entries())
    if (segment.arrivalDate && segment.arrivalDate < segment.departureDate)
      context.addIssue({
        code: "custom",
        message: "Arrival must be on or after departure.",
        path: ["segments", index, "arrivalDate"],
      });
}

export const createResearchItemSchema = z
  .object(researchItemFields)
  .superRefine(validateResearchItem);
export const updateResearchItemSchema = z
  .object({ ...researchItemFields, id: z.uuid() })
  .superRefine(validateResearchItem);
export const deleteResearchItemSchema = z.object({ id: z.uuid(), tripId: z.uuid() });
export const researchSelectionSchema = z.object({
  researchItemId: z.uuid(),
  tripId: z.uuid(),
  variantId: z.uuid(),
});
export const researchApplySchema = researchSelectionSchema.extend({
  scheduleChoice: z.enum(["automatic", "keep_extra_days"]).default("automatic"),
  targetItemId: z.uuid().optional().nullable(),
});
export const researchApplicationSchema = z.object({
  applicationId: z.uuid(),
  tripId: z.uuid(),
});
export const researchWorkspaceSchema = z.object({ tripId: z.uuid(), variantId: z.uuid() });

export type CreateResearchItemInput = z.input<typeof createResearchItemSchema>;
export type UpdateResearchItemInput = z.input<typeof updateResearchItemSchema>;
