import { z } from "zod";

import { tripStatuses } from "@/features/trips/status";

/**
 * Creation asks the traveller nothing, so it carries only what the browser knows: their timezone,
 * and their own calendar date for the trip's placeholder name.
 */
export const createTripSchema = z.object({
  timezone: z.string().trim().min(1, "Enter an IANA timezone."),
  today: z.union([z.literal(""), z.iso.date()]),
});

export const updateTripSchema = z
  .object({
    tripId: z.uuid(),
    title: z.string().trim().min(1, "Enter a trip title.").max(120),
    timezone: z.string().trim().min(1, "Enter an IANA timezone."),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
    startDate: z.union([z.literal(""), z.iso.date()]),
    endDate: z.union([z.literal(""), z.iso.date()]),
    dayCount: z.coerce
      .number()
      .int()
      .min(1, "Enter at least one day.")
      .max(366, "Trips can span at most 366 days."),
  })
  .refine((value) => Boolean(value.startDate) === Boolean(value.endDate), {
    message: "Choose both dates, or leave both blank.",
    path: ["endDate"],
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: "End date must be on or after start date.",
    path: ["endDate"],
  });

/** Renaming is its own action so the docked field never has to carry the rest of the trip. */
export const renameTripSchema = z.object({
  title: z.string().trim().min(1, "Enter a trip name.").max(120),
  tripId: z.uuid(),
});

export const tripIdSchema = z.uuid();

export const setTripStatusSchema = z.object({
  status: z.enum(tripStatuses),
  tripId: z.uuid(),
});
