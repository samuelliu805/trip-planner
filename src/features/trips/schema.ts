import { z } from "zod";

export const createTripSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a trip title.").max(120),
    startDate: z.iso.date("Choose a valid start date."),
    endDate: z.iso.date("Choose a valid end date."),
    timezone: z.string().trim().min(1, "Enter an IANA timezone."),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "End date must be on or after start date.",
    path: ["endDate"],
  });

export const updateTripSchema = z.object({
  tripId: z.uuid(),
  title: z.string().trim().min(1, "Enter a trip title.").max(120),
  timezone: z.string().trim().min(1, "Enter an IANA timezone."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
});

export const tripIdSchema = z.uuid();
