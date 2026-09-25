import type { Locale } from "../i18n/config.ts";
import { translateMessage } from "../i18n/translate.ts";
import type { ItineraryItem, PlannerDay } from "../itinerary/types.ts";
import { flightEndpointRole } from "../itinerary/flight-endpoints.ts";
import type { PlannerMapLine, PlannerMapMarker } from "../maps/planner-map-model.ts";
import type { MarkerKind } from "../../lib/providers/maps/contracts.ts";
import { routeGeometryCoordinates } from "../../lib/providers/routes/geometry.ts";

import { isEligibleRouteStopType } from "./route-config.ts";
import { canonicalRouteLegMode, type DayRouteCalculation, type RouteLegMode } from "./types.ts";

export type DayRouteLineStop = {
  itemId: string;
  latitude: number;
  longitude: number;
};

const markerKind = (item: ItineraryItem): MarkerKind =>
  flightEndpointRole(item) === "departure"
    ? ("flightDeparture" as const)
    : flightEndpointRole(item) === "arrival"
      ? ("flightArrival" as const)
      : item.type === "hotel"
        ? "hotel"
        : item.type === "meal"
          ? "meal"
          : item.type === "car_rental"
            ? "carRental"
            : "activity";

const markerGlyph = {
  en: {
    activity: "A",
    carRental: "R",
    hotel: "H",
    meal: "M",
    flightDeparture: "D",
    flightArrival: "A",
  },
  "zh-CN": {
    activity: "活",
    carRental: "租",
    hotel: "住",
    meal: "餐",
    flightDeparture: "出",
    flightArrival: "到",
  },
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
      ? `${kinds.size === 1 && (marker.entries[0].kind === "flightDeparture" || marker.entries[0].kind === "flightArrival") ? `${markerGlyph[locale][marker.entries[0].kind]} · ` : ""}${positions.join(" · ")}`
      : kinds.size === 1
        ? markerGlyph[locale][marker.entries[0].kind as keyof (typeof markerGlyph)["en"]]
        : "•";
  }
  return [...grouped.values()];
}

export function buildFlightEndpointMarkers(days: PlannerDay[], locale: Locale = "en") {
  return days.flatMap((day) =>
    eligibleDayRouteItems(day).flatMap((item) => {
      const role = flightEndpointRole(item);
      if (!role || !item.place) return [];
      const kind = role === "departure" ? ("flightDeparture" as const) : ("flightArrival" as const);
      return [
        {
          address: item.place.formattedAddress,
          appearance: "category" as const,
          entries: [
            {
              dayLabel: translateMessage(locale, "Day {day}", { day: day.day_number }),
              dayNumber: day.day_number,
              itemId: item.id,
              kind,
              title: item.title,
            },
          ],
          id: `flight-endpoint:${item.id}`,
          itemIds: [item.id],
          latitude: item.place.latitude,
          longitude: item.place.longitude,
          summary: item.title,
        },
      ];
    }),
  );
}

function calculatedRouteLine(
  leg: DayRouteCalculation["calculatedLegs"][number],
  position = leg.position,
): PlannerMapLine[] {
  try {
    const coordinates = routeGeometryCoordinates(leg.geometry);
    if (coordinates.length < 2) return [];
    return [
      {
        color: "#166534",
        dashed: leg.geometry.source === "straight",
        id: `route-leg:${position}:${leg.legSignature}`,
        path: coordinates.map(({ latitude, longitude }) => ({ lat: latitude, lng: longitude })),
        position,
        routeLayer: "places",
      },
    ];
  } catch {
    return [];
  }
}

const connectionKey = (from: string, to: string, mode: RouteLegMode) =>
  `${from}\u0000${to}\u0000${canonicalRouteLegMode(mode)}`;

export function buildDayRouteLines(
  calculation: DayRouteCalculation | null,
  calculatedStopItemIds?: string[],
  displayedStops?: DayRouteLineStop[],
  displayedLegModes?: RouteLegMode[],
): PlannerMapLine[] {
  if (!displayedStops) {
    if (!calculation) return [];
    return calculation.calculatedLegs.flatMap((leg) => calculatedRouteLine(leg));
  }

  const calculatedByConnection = new Map(
    (calculation?.calculatedLegs ?? []).flatMap((leg) => {
      const from = calculatedStopItemIds?.[leg.position - 1];
      const to = calculatedStopItemIds?.[leg.position];
      return from && to ? [[connectionKey(from, to, leg.mode), leg] as const] : [];
    }),
  );
  return displayedStops.slice(0, -1).flatMap((from, index) => {
    const to = displayedStops[index + 1];
    const position = index + 1;
    const displayedMode = displayedLegModes?.[index];
    const cached = displayedMode
      ? calculatedByConnection.get(connectionKey(from.itemId, to.itemId, displayedMode))
      : undefined;
    if (cached) {
      const line = calculatedRouteLine(cached, position);
      if (line.length) return line;
    }
    if (from.latitude === to.latitude && from.longitude === to.longitude) return [];
    return [
      {
        color: "#166534",
        dashed: true,
        geodesic: false,
        id: `route-preview:${position}:${from.itemId}:${to.itemId}`,
        path: [
          { lat: from.latitude, lng: from.longitude },
          { lat: to.latitude, lng: to.longitude },
        ],
        position,
        routeLayer: "places" as const,
      },
    ];
  });
}
