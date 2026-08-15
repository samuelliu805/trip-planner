import type { z } from "zod";

import type {
  ownerShareImageStateSchema,
  prepareShareImageSchema,
  shareImageManifestSchema,
  shareImagePartInputSchema,
} from "./long-image/schema";
import type {
  publicItineraryLinkSchema,
  publicItinerarySchema,
  publicRouteCalculationSchema,
  publicViewSchema,
} from "./schema";

export type PublicItinerary = z.infer<typeof publicItinerarySchema>;
export type PublicItineraryDay = PublicItinerary["days"][number];
export type PublicItineraryItem = PublicItineraryDay["items"][number];
export type PublicItemMedia = NonNullable<PublicItineraryItem["media"]>[number];
export type PublicSavedRoute = PublicItinerary["savedRoutes"][number];
export type PublicView = z.infer<typeof publicViewSchema>;
export type PublicItineraryLink = z.infer<typeof publicItineraryLinkSchema>;
export type PublicRouteCalculation = z.infer<typeof publicRouteCalculationSchema>;
export type OwnerShareImageState = z.infer<typeof ownerShareImageStateSchema>;
export type PreparedShareImage = z.infer<typeof prepareShareImageSchema>;
export type ShareImageManifest = z.infer<typeof shareImageManifestSchema>;
export type ShareImagePartInput = z.infer<typeof shareImagePartInputSchema>;

export type ShareActionResult<T = PublicItineraryLink> =
  { data: T; error?: never } | { data?: never; error: string };
