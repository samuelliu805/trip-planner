import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";
import { decisionSummaryItemTypes } from "@/features/variants/decision-summary-types";

export const affectsDecisionSummary = (type?: string) =>
  decisionSummaryItemTypes.includes(type as (typeof decisionSummaryItemTypes)[number]);

const localityProjectionTypes = ["location", "activity", "meal", "hotel"] as const;

export const affectsLocalityProjection = (type?: string) =>
  localityProjectionTypes.includes(type as (typeof localityProjectionTypes)[number]);

export function plannerWorkspaceItems(workspace: PlannerWorkspace | undefined) {
  return workspace?.days.flatMap(({ items }) => items) ?? [];
}

export function decisionSummaryItemChanged(
  previous: ItineraryItem | undefined,
  next: ItineraryItem,
) {
  if (!previous) return affectsDecisionSummary(next.type);
  if (
    previous.price_amount !== next.price_amount ||
    previous.price_currency !== next.price_currency
  )
    return true;
  if (!affectsDecisionSummary(previous.type) && !affectsDecisionSummary(next.type)) return false;
  if (
    previous.type !== next.type ||
    previous.day_id !== next.day_id ||
    previous.place_id !== next.place_id
  )
    return true;
  if (
    (next.type === "location" || next.type === "hotel") &&
    previous.title.trim() !== next.title.trim()
  )
    return true;
  if (
    next.type === "transport" &&
    JSON.stringify(previous.details) !== JSON.stringify(next.details)
  )
    return true;
  return (
    previous.place?.providerPlaceId !== next.place?.providerPlaceId ||
    previous.place?.latitude !== next.place?.latitude ||
    previous.place?.longitude !== next.place?.longitude ||
    previous.place?.localityName !== next.place?.localityName ||
    previous.place?.countryCode !== next.place?.countryCode
  );
}

export function localityProjectionItemChanged(
  previous: ItineraryItem | undefined,
  next: ItineraryItem,
) {
  if (!previous) return affectsLocalityProjection(next.type);
  if (!affectsLocalityProjection(previous.type) && !affectsLocalityProjection(next.type))
    return false;
  return (
    previous.type !== next.type ||
    previous.day_id !== next.day_id ||
    previous.place_id !== next.place_id ||
    (next.type === "location" && previous.title.trim() !== next.title.trim()) ||
    previous.place?.providerPlaceId !== next.place?.providerPlaceId ||
    previous.place?.latitude !== next.place?.latitude ||
    previous.place?.longitude !== next.place?.longitude ||
    previous.place?.localityName !== next.place?.localityName ||
    previous.place?.countryCode !== next.place?.countryCode
  );
}
