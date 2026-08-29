import { z } from "zod";

import { overviewRouteModes, routeLegModes } from "./types";

const identitySchema = z.string().uuid();
const telemetryFields = {
  operationId: identitySchema.optional(),
  telemetryRouteMode: z.enum([...routeLegModes, "mixed", "unset"] as const).optional(),
};

export const saveRouteSchema = z.object({
  dayId: identitySchema,
  itemIds: z.array(identitySchema).min(2).max(20),
  legModes: z.array(z.enum(routeLegModes)),
  tripId: identitySchema,
  variantId: identitySchema,
  ...telemetryFields,
});
export const calculateRouteSchema = z.object({
  planId: identitySchema,
  tripId: identitySchema,
  variantId: identitySchema,
  ...telemetryFields,
});
export const calculateOverviewRouteSchema = z.object({
  legs: z
    .array(
      z.object({
        mode: z.enum(overviewRouteModes),
        position: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(50)
    .superRefine((legs, context) => {
      if (new Set(legs.map(({ position }) => position)).size !== legs.length)
        context.addIssue({ code: "custom", message: "Overview leg positions must be unique." });
    }),
  tripId: identitySchema,
  variantId: identitySchema,
  ...telemetryFields,
});
export const clearRouteSchema = z.object({
  dayId: identitySchema,
  tripId: identitySchema,
  variantId: identitySchema,
});
