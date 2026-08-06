import type { z } from "zod";

import type {
  publicItineraryLinkSchema,
  publicItinerarySchema,
  publicRouteCalculationSchema,
  publicViewSchema,
} from "./schema";

export type PublicItinerary = z.infer<typeof publicItinerarySchema>;
export type PublicItineraryDay = PublicItinerary["days"][number];
export type PublicItineraryItem = PublicItineraryDay["items"][number];
export type PublicSavedRoute = PublicItinerary["savedRoutes"][number];
export type PublicView = z.infer<typeof publicViewSchema>;
export type PublicItineraryLink = z.infer<typeof publicItineraryLinkSchema>;
export type PublicRouteCalculation = z.infer<typeof publicRouteCalculationSchema>;

export type ShareActionResult<T = PublicItineraryLink> =
  { data: T; error?: never } | { data?: never; error: string };
