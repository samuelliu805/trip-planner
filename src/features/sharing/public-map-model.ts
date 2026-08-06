import { decodeEncodedPolyline, haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";
import type { PlannerMapLine, PlannerMapMarker } from "../maps/planner-map-model.ts";
import type { OverviewRouteMode } from "../routes/types.ts";

import type {
  PublicItinerary,
  PublicItineraryDay,
  PublicRouteCalculation,
  PublicSavedRoute,
} from "./types";
import { samePublicCity } from "./presentation.ts";

function markerKind(type: string): "activity" | "carRental" | "city" | "hotel" | "meal" {
  if (type === "location") return "city";
  if (type === "hotel") return "hotel";
  if (type === "meal") return "meal";
  if (type === "car_rental") return "carRental";
  return "activity";
}

export function buildPublicMarkers(itinerary: PublicItinerary): PlannerMapMarker[] {
  return itinerary.days.flatMap((day) =>
    day.items.flatMap((item) => {
      if (typeof item.place?.latitude !== "number" || typeof item.place.longitude !== "number")
        return [];
      const kind = markerKind(item.type);
      return [
        {
          accessibleLabel: `${item.title}, Day ${day.dayNumber}`,
          address: item.place.address,
          appearance: "category" as const,
          entries: [
            {
              dayLabel: `Day ${day.dayNumber}`,
              dayNumber: day.dayNumber,
              itemId: item.ref,
              kind,
              title: item.title,
            },
          ],
          id: `public:${item.ref}`,
          itemIds: [item.ref],
          label: kind === "city" ? `D${day.dayNumber}` : undefined,
          latitude: item.place.latitude,
          longitude: item.place.longitude,
          readOnly: true,
          selectable: true,
          summary: item.place.displayName,
          variantColor: itinerary.variant.color,
        },
      ];
    }),
  );
}

export function publicOverviewStops(itinerary: PublicItinerary) {
  const entries = itinerary.days.flatMap((day) =>
    day.items
      .filter(
        (item) =>
          item.type === "location" &&
          typeof item.place?.latitude === "number" &&
          typeof item.place.longitude === "number",
      )
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({ dayNumber: day.dayNumber, item })),
  );
  return entries
    .filter(({ item }, index) => index === 0 || !samePublicCity(entries[index - 1].item, item))
    .map(({ dayNumber, item }) => ({
      dayNumber,
      latitude: item.place!.latitude!,
      longitude: item.place!.longitude!,
      ref: item.ref,
      title: item.title,
    }));
}

const publicOverviewFlightThresholdMeters = 500_000;
const overviewModePriority: OverviewRouteMode[] = [
  "flight",
  "self_driving",
  "train",
  "bus",
  "bike",
];

function explicitPublicOverviewMode(day?: PublicItineraryDay): OverviewRouteMode | undefined {
  const modes = new Set<OverviewRouteMode>();
  for (const item of day?.items ?? []) {
    if (item.type === "flight") modes.add("flight");
    if (item.type === "train") modes.add("train");
  }
  return overviewModePriority.find((mode) => modes.has(mode));
}

export function publicOverviewDefaultModes(itinerary: PublicItinerary): OverviewRouteMode[] {
  const stops = publicOverviewStops(itinerary);
  const daysByNumber = new Map(itinerary.days.map((day) => [day.dayNumber, day]));
  return stops.slice(1).map((destination, index) => {
    const explicit = explicitPublicOverviewMode(daysByNumber.get(destination.dayNumber));
    if (explicit) return explicit;
    const origin = stops[index];
    return haversineDistanceMeters(
      { latitude: origin.latitude, longitude: origin.longitude },
      { latitude: destination.latitude, longitude: destination.longitude },
    ) >= publicOverviewFlightThresholdMeters
      ? "flight"
      : "self_driving";
  });
}

export function buildPublicOverviewLines(itinerary: PublicItinerary): PlannerMapLine[] {
  const stops = publicOverviewStops(itinerary);
  return stops.slice(0, -1).flatMap((stop, index) => {
    const next = stops[index + 1];
    if (stop.latitude === next.latitude && stop.longitude === next.longitude) return [];
    return [
      {
        color: itinerary.variant.color,
        dashed: true,
        geodesic: true,
        id: `public-overview:${stop.ref}:${next.ref}`,
        path: [
          { lat: stop.latitude, lng: stop.longitude },
          { lat: next.latitude, lng: next.longitude },
        ],
        position: index + 1,
        readOnly: true,
        routeLayer: "city" as const,
      },
    ];
  });
}

type SafeLeg = PublicSavedRoute["legs"][number] | PublicRouteCalculation["legs"][number];

export function buildPublicRouteLines(
  legs: SafeLeg[],
  color: string,
  keyPrefix: string,
): PlannerMapLine[] {
  return legs.flatMap((leg) => {
    if (!leg.geometry) return [];
    try {
      const points =
        leg.geometry.source === "google"
          ? decodeEncodedPolyline(leg.geometry.encodedPolyline)
          : [leg.geometry.origin, leg.geometry.destination];
      if (points.length < 2) return [];
      return [
        {
          color,
          dashed: leg.geometry.source === "straight",
          id: `${keyPrefix}:${leg.position}`,
          path: points.map(({ latitude, longitude }) => ({ lat: latitude, lng: longitude })),
          position: leg.position,
          readOnly: true,
          routeLayer: "places" as const,
        },
      ];
    } catch {
      return [];
    }
  });
}

export function publicRouteCandidates(day?: PublicItineraryDay) {
  return (day?.items ?? []).filter(
    (item) =>
      ["activity", "meal", "hotel"].includes(item.type) &&
      typeof item.place?.latitude === "number" &&
      typeof item.place.longitude === "number",
  );
}

function hasPublicCoordinates(item: PublicItineraryDay["items"][number]) {
  return typeof item.place?.latitude === "number" && typeof item.place.longitude === "number";
}

export function publicDayRoutePlan(itinerary: PublicItinerary, dayRef?: string) {
  const dayIndex = itinerary.days.findIndex(({ ref }) => ref === dayRef);
  const resolvedIndex = dayIndex >= 0 ? dayIndex : 0;
  const day = itinerary.days[resolvedIndex];
  const previousDay = itinerary.days[resolvedIndex - 1];
  const previousHotel = previousDay
    ? previousDay.items
        .filter((item) => item.type === "hotel" && hasPublicCoordinates(item))
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .at(-1)
    : undefined;
  const currentItems = (day?.items ?? [])
    .filter(
      (item) => ["activity", "meal", "hotel"].includes(item.type) && hasPublicCoordinates(item),
    )
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const unmappedActivities = (day?.items ?? [])
    .filter((item) => item.type === "activity" && !hasPublicCoordinates(item))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const currentHotel = currentItems.filter(({ type }) => type === "hotel").at(-1);
  const middle = currentItems.filter(({ ref }) => ref !== currentHotel?.ref);
  const items = [previousHotel, ...middle, currentHotel].filter(
    (item): item is NonNullable<typeof item> => Boolean(item),
  );

  return {
    day,
    endRef: currentHotel?.ref,
    items,
    previousDay,
    startRef: previousHotel?.ref,
    unmappedActivities,
  };
}
