import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";

export type ActivityLocality = {
  countryCode?: string;
  itemId: string;
  key: string;
  label: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  source: "activity" | "legacy_city";
};

export type DayLocalityProjection = {
  dayId: string;
  localities: ActivityLocality[];
  primaryLocality: ActivityLocality | null;
  usedLegacyFallback: boolean;
};

export type OverviewAnchor = {
  itemId: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

export type DayOverviewCluster = {
  anchor: OverviewAnchor | null;
  itemIds: string[];
  locality: ActivityLocality;
  returning: boolean;
};

export type OverviewStageProjection = {
  anchor: OverviewAnchor | null;
  dayIds: string[];
  days: PlannerDay[];
  firstDayIndex: number;
  id: string;
  lastDayIndex: number;
  primaryLocality: ActivityLocality | null;
  secondaryLocalities: ActivityLocality[];
};

export function compareManualItemOrder(a: ItineraryItem, b: ItineraryItem) {
  if (a.type === "hotel" && b.type !== "hotel") return 1;
  if (a.type !== "hotel" && b.type === "hotel") return -1;
  return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
}

export function compareManualDayOrder(a: PlannerDay, b: PlannerDay) {
  return a.day_number - b.day_number || a.id.localeCompare(b.id);
}

export function normalizeLocalityLabel(label: string) {
  return label.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function formatDayLocalitySummary(projection: DayLocalityProjection, maximumVisible = 2) {
  if (!projection.localities.length) return "Locality unavailable";
  const visible = projection.localities.slice(0, maximumVisible).map(({ label }) => label);
  const remaining = projection.localities.length - visible.length;
  return remaining > 0 ? `${visible.join(" · ")} · +${remaining}` : visible.join(" · ");
}

export function localityKey(label: string, countryCode?: string) {
  return `${countryCode?.toUpperCase() ?? ""}:${normalizeLocalityLabel(label)}`;
}

export function usableCoordinate(latitude?: number, longitude?: number) {
  return (
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}
