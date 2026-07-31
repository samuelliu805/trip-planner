import { z } from "zod";

export const createTripSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a trip title.").max(120),
    startDate: z.union([z.literal(""), z.iso.date("Choose a valid start date.")]),
    endDate: z.union([z.literal(""), z.iso.date("Choose a valid end date.")]),
    dayCount: z.coerce.number().int().min(1).max(366).optional(),
    timezone: z.string().trim().min(1, "Enter an IANA timezone."),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  })
  .refine((value) => Boolean(value.startDate) === Boolean(value.endDate), {
    message: "Choose both dates, or leave both blank.",
    path: ["endDate"],
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: "End date must be on or after start date.",
    path: ["endDate"],
  });

export const updateTripSchema = z.object({
  tripId: z.uuid(),
  title: z.string().trim().min(1, "Enter a trip title.").max(120),
  timezone: z.string().trim().min(1, "Enter an IANA timezone."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  startDate: z.union([z.literal(""), z.iso.date()]),
  endDate: z.union([z.literal(""), z.iso.date()]),
  dayCount: z.coerce.number().int().min(1).max(366),
}).refine((value) => Boolean(value.startDate) === Boolean(value.endDate), {
  message: "Choose both dates, or leave both blank.", path: ["endDate"],
}).refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
  message: "End date must be on or after start date.", path: ["endDate"],
});

export const tripIdSchema = z.uuid();
