import { z } from "zod";

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
  endDate: z.iso.date().optional().nullable(),
  itemId: optionalUuid,
  locationText: optionalText(200),
  note: optionalText(5000),
  originText: optionalText(200),
  sourceUrl: optionalUrl,
  startDate: z.iso.date().optional().nullable(),
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
}

export const createResearchItemSchema = z
  .object(researchItemFields)
  .superRefine(validateResearchItem);
export const updateResearchItemSchema = z
  .object({ ...researchItemFields, id: z.uuid() })
  .superRefine(validateResearchItem);
export const deleteResearchItemSchema = z.object({ id: z.uuid(), tripId: z.uuid() });

export type CreateResearchItemInput = z.input<typeof createResearchItemSchema>;
export type UpdateResearchItemInput = z.input<typeof updateResearchItemSchema>;
