import type { Locale } from "../i18n/config.ts";
import { translateMessage } from "../i18n/translate.ts";
import type { ItineraryItem, PlannerDay } from "../itinerary/types.ts";
import type { PlannerMapLine, PlannerMapMarker } from "../maps/planner-map-model.ts";
import { decodeEncodedPolyline } from "../../lib/providers/routes/geo.ts";

import { isEligibleRouteStopType } from "./route-config.ts";
import type { DayRouteCalculation } from "./types.ts";

const markerKind = (item: ItineraryItem): "activity" | "hotel" | "meal" =>
  item.type === "hotel" ? "hotel" : item.type === "meal" ? "meal" : "activity";

const markerGlyph = {
  en: { activity: "A", hotel: "H", meal: "M" },
  "zh-CN": { activity: "活", hotel: "住", meal: "餐" },
} as const;

export function eligibleDayRouteItems(day?: PlannerDay): ItineraryItem[] {
  return (
    day?.items
      .filter((item) => isEligibleRouteStopType(item.type) && item.place)
      .sort((a, b) => a.sort_order - b.sort_order) ?? []
  );
}

export function buildDayRouteMarkers(
  day: PlannerDay | undefined,
  stopItemIds: string[],
  previousDay?: PlannerDay,
  locale: Locale = "en",
) {
  const grouped = new Map<string, PlannerMapMarker>();
  const positionsByItem = new Map<string, number[]>();
  stopItemIds.forEach((itemId, index) => {
    positionsByItem.set(itemId, [...(positionsByItem.get(itemId) ?? []), index + 1]);
  });

  const candidates = [
    ...eligibleDayRouteItems(day).map((item) => ({ day: day!, item })),
    ...eligibleDayRouteItems(previousDay)
      .filter(({ id, type }) => type === "hotel" && positionsByItem.has(id))
      .map((item) => ({ day: previousDay!, item })),
  ];

  for (const { day: itemDay, item } of candidates) {
    const kind = markerKind(item);
    const key = item.place!.id;
    const entry = {
      dayLabel: translateMessage(locale, "Day {day}", { day: itemDay.day_number }),
      dayNumber: itemDay.day_number,
      itemId: item.id,
      kind,
      title: item.title,
    };
    const existing = grouped.get(key);
    if (existing) {
      existing.entries.push(entry);
      existing.itemIds.push(item.id);
      continue;
    }
    grouped.set(key, {
      address: item.place!.formattedAddress,
      appearance: "route-unplanned",
      entries: [entry],
      id: `day-route:${day?.id ?? itemDay.id}:${key}`,
      itemIds: [item.id],
      latitude: item.place!.latitude,
      longitude: item.place!.longitude,
    });
  }

  for (const marker of grouped.values()) {
    const positions = marker.itemIds
      .flatMap((itemId) => positionsByItem.get(itemId) ?? [])
      .sort((a, b) => a - b);
    const kinds = new Set(marker.entries.map(({ kind }) => kind));
    marker.appearance = positions.length ? "route-planned" : "route-unplanned";
    marker.label = positions.length
      ? positions.join(" · ")
      : kinds.size === 1
        ? markerGlyph[locale][marker.entries[0].kind as keyof (typeof markerGlyph)["en"]]
        : "•";
  }
  return [...grouped.values()];
}

export function buildDayRouteLines(calculation: DayRouteCalculation | null): PlannerMapLine[] {
  if (!calculation) return [];
  return calculation.calculatedLegs.flatMap((leg) => {
    try {
      const coordinates =
        leg.geometry.source === "google"
          ? decodeEncodedPolyline(leg.geometry.encodedPolyline)
          : [leg.geometry.origin, leg.geometry.destination];
      if (coordinates.length < 2) return [];
      return [
        {
          color: "#166534",
          dashed: leg.geometry.source === "straight",
          id: `route-leg:${leg.position}:${leg.legSignature}`,
          path: coordinates.map(({ latitude, longitude }) => ({ lat: latitude, lng: longitude })),
          position: leg.position,
          routeLayer: "places",
        },
      ];
    } catch {
      return [];
    }
  });
}
