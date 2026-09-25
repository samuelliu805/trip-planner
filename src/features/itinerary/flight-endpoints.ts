import type { ItineraryItem } from "./types";

export type FlightEndpointRole = "departure" | "arrival";

function endpointDetails(item: Pick<ItineraryItem, "details">) {
  const details = item.details;
  return details && typeof details === "object" && !Array.isArray(details) ? details : null;
}

export function flightEndpointRole(
  item: Pick<ItineraryItem, "details">,
): FlightEndpointRole | null {
  const details = endpointDetails(item);
  if (!details) return null;
  if (typeof details.flightEndpointParentId !== "string") return null;
  return details.flightEndpointRole === "departure" || details.flightEndpointRole === "arrival"
    ? details.flightEndpointRole
    : null;
}

export function flightEndpointParentId(item: Pick<ItineraryItem, "details">): string | null {
  const details = endpointDetails(item);
  return details && flightEndpointRole(item) ? String(details.flightEndpointParentId) : null;
}

export function flightEndpointDate(item: Pick<ItineraryItem, "details">): string | null {
  const value = endpointDetails(item)?.flightEndpointDate;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function isMatrixVisibleItem(item: Pick<ItineraryItem, "details">): boolean {
  return flightEndpointRole(item) === null;
}
