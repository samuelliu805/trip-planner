import type { ConfigureDayRouteInput } from "./types";

export function validateRouteConfiguration(input: ConfigureDayRouteInput): string | null {
  if (new Set(input.itemIds).size !== input.itemIds.length)
    return "A route stop can only be included once.";
  if (input.itemIds.length > 27) return "A route supports no more than 27 stops.";
  return null;
}
