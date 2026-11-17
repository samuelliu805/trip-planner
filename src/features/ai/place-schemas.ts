import { z } from "zod";

export const placeReferenceSchema = z
  .object({
    provider: z.enum(["google", "amap"]),
    providerPlaceId: z.string().regex(/^[A-Za-z0-9_-]{1,300}$/),
  })
  .strict();

export const customLocationSchema = z
  .object({
    displayName: z.string().trim().min(1).max(300),
    formattedAddress: z.string().trim().max(500).optional(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    coordinateSystem: z.literal("wgs84").default("wgs84"),
  })
  .strict();

const selectedLocation = z.object({ selection_id: z.uuid() }).strict();
const customLocation = z.object({ custom: customLocationSchema }).strict();

export const ideaLocationSchema = z.union([
  selectedLocation,
  customLocation,
  z.object({ reference: placeReferenceSchema }).strict(),
]);

export const itemLocationSchema = z.union([
  selectedLocation,
  customLocation,
  z.object({ place_id: z.uuid() }).strict(),
]);

export type PlacesToolName = "place_search" | "place_resolve";
export type PlaceLookupLimits = { minute: number; daily: number; globalDaily: number };
