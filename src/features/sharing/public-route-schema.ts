import { z } from "zod";

import { routeGeometryFromJson } from "../../lib/providers/routes/geometry.ts";

import { itineraryItemTypes } from "../itinerary/item-schema.ts";
import { overviewRouteModes, routeLegModes } from "../routes/types.ts";

const routeGeometrySchema = z.unknown().transform((value, context) => {
  const geometry = routeGeometryFromJson(value);
  if (geometry) return geometry;
  context.addIssue({ code: "custom", message: "The route geometry is invalid." });
  return z.NEVER;
});

const publicRouteLegSchema = z
  .object({
    distanceMeters: z.number().nonnegative().optional(),
    durationSeconds: z.number().nonnegative().nullable().optional(),
    geometry: routeGeometrySchema.optional(),
    mode: z.enum(routeLegModes),
    position: z.number().int().positive(),
  })
  .strict();

const publicRouteStopSchema = z
  .object({
    displayName: z.string().min(1).max(300),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    position: z.number().int().positive(),
    ref: z.string().length(64),
    title: z.string().min(1).max(200),
    type: z.enum(itineraryItemTypes),
  })
  .strict();

export const publicSavedRouteSchema = z
  .object({
    dayNumber: z.number().int().positive(),
    dayRef: z.string().length(64),
    legs: z.array(publicRouteLegSchema),
    ref: z.string().length(64),
    status: z.enum(["saved", "calculated"]),
    stops: z.array(publicRouteStopSchema),
    totalDistanceMeters: z.number().nonnegative().nullable().optional(),
    totalDurationSeconds: z.number().nonnegative().nullable().optional(),
  })
  .strict();

export const publicRouteCalculationInputSchema = z
  .object({
    dayRef: z.string().length(64),
    legModes: z
      .array(z.enum(["self_driving", "subway", "bike", "walk"]))
      .min(1)
      .max(19),
    stopRefs: z.array(z.string().length(64)).min(2).max(20),
    token: z.uuid(),
  })
  .strict()
  .refine((value) => value.legModes.length === value.stopRefs.length - 1, {
    message: "Choose one travel mode for each route leg.",
  })
  .refine((value) => new Set(value.stopRefs).size === value.stopRefs.length, {
    message: "Temporary route stops must be unique.",
  });

export const publicOverviewRouteCalculationInputSchema = z
  .object({
    legModes: z.array(z.enum(overviewRouteModes)).min(1).max(19),
    stopRefs: z.array(z.string().length(64)).min(2).max(20),
    token: z.uuid(),
  })
  .strict()
  .refine((value) => value.legModes.length === value.stopRefs.length - 1, {
    message: "Choose one travel mode for each city connection.",
  })
  .refine((value) => new Set(value.stopRefs).size === value.stopRefs.length, {
    message: "Whole-trip route stops must be unique.",
  });

export const publicRouteCalculationSchema = z
  .object({
    legs: z.array(publicRouteLegSchema),
    totalDistanceMeters: z.number().nonnegative(),
    totalDurationSeconds: z.number().nonnegative().nullable(),
  })
  .strict();
