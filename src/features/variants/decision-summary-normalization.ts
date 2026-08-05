import type { TransportMode } from "../itinerary/types.ts";
import { transportModes } from "../itinerary/types.ts";

import type {
  DecisionSummaryDayRow,
  DecisionSummaryItemRow,
  DecisionSummaryModeCount,
} from "./decision-summary-types.ts";

export function validDecisionSummaryCoordinates(place: DecisionSummaryItemRow["place"]) {
  return Boolean(
    place &&
    place.latitude !== null &&
    place.longitude !== null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    place.latitude >= -90 &&
    place.latitude <= 90 &&
    place.longitude >= -180 &&
    place.longitude <= 180,
  );
}

export function decisionSummaryPlaceKey(item: DecisionSummaryItemRow) {
  if (!item.place_id || item.place?.id !== item.place_id) return null;
  return item.place.google_place_id
    ? `google:${item.place.google_place_id}`
    : `place:${item.place.id}`;
}

export function sortedDecisionSummaryDays(days: DecisionSummaryDayRow[]) {
  return [...days].sort((a, b) => a.day_number - b.day_number || a.id.localeCompare(b.id));
}

export function sortedDecisionSummaryItems(items: DecisionSummaryItemRow[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function countedDecisionSummaryModes<TMode extends string>(
  modes: TMode[],
  order: readonly TMode[],
  label: (mode: TMode) => string,
): DecisionSummaryModeCount<TMode>[] {
  const counts = new Map<TMode, number>();
  for (const mode of modes) counts.set(mode, (counts.get(mode) ?? 0) + 1);
  return order.flatMap((mode) => {
    const count = counts.get(mode);
    return count ? [{ count, label: label(mode), mode }] : [];
  });
}

export function explicitDecisionSummaryTransportMode(
  item: DecisionSummaryItemRow,
): TransportMode | null {
  if (item.type === "flight") return "flight";
  if (item.type === "train") return "train";
  if (item.type !== "transport" || !item.details || Array.isArray(item.details)) return null;
  const raw = typeof item.details === "object" ? item.details.mode : undefined;
  if (typeof raw !== "string") return null;
  const aliases: Record<string, TransportMode> = {
    coach: "bus",
    light_rail: "subway",
    metro: "subway",
    rental_car: "self_driving",
  };
  const normalized = aliases[raw] ?? raw;
  return transportModes.includes(normalized as TransportMode)
    ? (normalized as TransportMode)
    : null;
}
