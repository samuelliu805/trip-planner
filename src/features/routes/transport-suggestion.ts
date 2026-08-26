import type { ItineraryItem } from "../itinerary/types.ts";

import { isRouteLegMode } from "./route-config.ts";
import { canonicalRouteLegMode, type RouteLegMode } from "./types.ts";

export function suggestedDraftLegMode(items: ItineraryItem[]): RouteLegMode {
  const modes = new Set<RouteLegMode>();
  for (const item of items) {
    if (item.type !== "transport") continue;
    const value = (item.details as Record<string, unknown>).mode;
    if (typeof value === "string" && isRouteLegMode(value)) modes.add(canonicalRouteLegMode(value));
  }
  return modes.size === 1 ? [...modes][0] : "walk";
}
