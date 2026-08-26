import type { DecisionSummaryDayRow, DecisionSummaryItemRow } from "./decision-summary-types.ts";

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
