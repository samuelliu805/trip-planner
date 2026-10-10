import { z } from "zod";
import { supportedLocales } from "../i18n/config";
import { deleteTripSchema, setTripStatusSchema } from "./schema";
export const tripBackgroundSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("trip.create"),
    input: z.object({
      tripId: z.literal(""),
      operationId: z.uuid(),
      currency: z.string().regex(/^[A-Z]{3}$/),
      dayCount: z.number().int().min(1).max(366),
      locale: z.enum(supportedLocales),
      timezone: z.string().min(1).max(120),
      title: z.string().trim().min(1).max(120),
    }),
  }),
  z.object({ kind: z.literal("trip.status"), before: z.string(), input: setTripStatusSchema }),
  z.object({ kind: z.literal("trip.delete"), input: deleteTripSchema }),
]);
