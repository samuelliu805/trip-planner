import { z } from "zod";

import { itineraryItemTypes } from "../itinerary/schema.ts";
import { overviewRouteModes, routeLegModes } from "../routes/types.ts";

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
const publicPlaceSchema = z
  .object({
    address: z.string().max(500).optional(),
    displayName: z.string().min(1).max(300),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .strict();
const publicCarRentalSchema = z
  .object({
    action: z.enum(["pickup", "return"]).optional(),
    address: z.string().max(300).optional(),
    company: z.string().max(120).optional(),
  })
  .strict();
const publicItemSchema = z
  .object({
    carRental: publicCarRentalSchema.optional(),
    endTime: z.string().optional(),
    links: z.array(publicLinkSchema).max(20).optional(),
    notes: z.string().max(5000).optional(),
    place: publicPlaceSchema.optional(),
    ref: z.string().length(64),
    scheduleLabel: z.string().max(120).optional(),
    sortOrder: z.number().int(),
    startTime: z.string().optional(),
    title: z.string().min(1).max(200),
    type: z.enum(itineraryItemTypes),
  })
  .strict();
const publicDaySchema = z
  .object({
    city: z.string().max(300).optional(),
    date: z.string().nullable().optional(),
    dayNumber: z.number().int().positive(),
    items: z.array(publicItemSchema),
    notes: z.string().max(5000).optional(),
    ref: z.string().length(64),
    title: z.string().max(200).nullable().optional(),
  })
  .strict();
const coordinatesSchema = z.object({ latitude: z.number(), longitude: z.number() }).strict();
const routeGeometrySchema = z.discriminatedUnion("source", [
  z.object({ encodedPolyline: z.string(), source: z.literal("google") }).strict(),
  z
    .object({
      destination: coordinatesSchema,
      origin: coordinatesSchema,
      source: z.literal("straight"),
    })
    .strict(),
]);
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
const publicSavedRouteSchema = z
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
        showMapRoutes: z.boolean(),
        showNotes: z.boolean(),
        showQuickActionLinks: z.boolean(),
        showTimes: z.boolean(),
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
    allowRouteExplore: z.boolean(),
    createdAt: z.string(),
    defaultView: publicViewSchema,
    id: z.uuid(),
    publicToken: z.uuid(),
    shareDescription: z.string().nullable(),
    shareTitle: z.string().nullable(),
    showAddresses: z.boolean(),
    showMapRoutes: z.boolean(),
    showNotes: z.boolean(),
    showQuickActionLinks: z.boolean(),
    showTimes: z.boolean(),
    tripId: z.uuid(),
    updatedAt: z.string(),
    variantId: z.uuid(),
  })
  .strict();

export const publicItinerarySettingsSchema = z
  .object({
    allowRouteExplore: z.boolean(),
    defaultView: z.enum(canonicalPublicViews),
    shareDescription: z.string().trim().max(500),
    shareTitle: z.string().trim().max(160),
    showAddresses: z.boolean(),
    showMapRoutes: z.boolean(),
    showNotes: z.boolean(),
    showQuickActionLinks: z.boolean(),
    showTimes: z.boolean(),
    variantId: z.uuid(),
  })
  .strict();

export const linkMutationSchema = z.object({ linkId: z.uuid(), tripId: z.uuid() }).strict();

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

export type PublicItinerarySettingsInput = z.infer<typeof publicItinerarySettingsSchema>;
