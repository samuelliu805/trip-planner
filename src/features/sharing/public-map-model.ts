import type { Locale } from "../i18n/config.ts";
import { translateMessage } from "../i18n/translate.ts";

import { routeGeometryCoordinates } from "../../lib/providers/routes/geometry.ts";
import type { PlannerMapLine, PlannerMapMarker } from "../maps/planner-map-model.ts";

import type {
  PublicItinerary,
  PublicItineraryDay,
  PublicRouteCalculation,
  PublicSavedRoute,
} from "./types";
import { derivePublicOverviewStages } from "./public-overview-map-model.ts";

export {
  buildPublicOverviewLines,
  publicOverviewDefaultModes,
  publicOverviewStops,
} from "./public-overview-map-model.ts";

function markerKind(type: string): "activity" | "carRental" | "city" | "hotel" | "meal" {
  if (type === "location") return "city";
  if (type === "hotel") return "hotel";
  if (type === "meal") return "meal";
  if (type === "car_rental") return "carRental";
  return "activity";
}

export function buildPublicMarkers(
  itinerary: PublicItinerary,
  theme?: { color: string; glyphColor: string },
  locale: Locale = "en",
): PlannerMapMarker[] {
  const activityMarkers = itinerary.days.flatMap((day) =>
    day.items.flatMap((item) => {
      if (item.type === "location") return [];
      if (typeof item.place?.latitude !== "number" || typeof item.place.longitude !== "number")
        return [];
      const kind = markerKind(item.type);
      return [
        {
          accessibleLabel: translateMessage(locale, "{item}, Day {day}", {
            day: day.dayNumber,
            item: item.title,
          }),
          address: item.place.address,
          appearance: "category" as const,
          entries: [
            {
              dayLabel: translateMessage(locale, "Day {day}", { day: day.dayNumber }),
              dayNumber: day.dayNumber,
              itemId: item.ref,
              kind,
              title: item.title,
            },
          ],
          ...(theme && { glyphColor: theme.glyphColor }),
          id: `public:${item.ref}`,
          itemIds: [item.ref],
          label:
            kind === "city"
              ? translateMessage(locale, "D{day}", { day: day.dayNumber })
              : undefined,
          latitude: item.place.latitude,
          longitude: item.place.longitude,
          readOnly: true,
          selectable: true,
          summary: item.place.displayName,
          variantColor: theme?.color ?? itinerary.variant.color,
        },
      ];
    }),
  );
  const stageMarkers = derivePublicOverviewStages(itinerary, locale).flatMap((stage, index) => {
    if (!stage.anchor) return [];
    return [
      {
        accessibleLabel: `${stage.title}, ${stage.dayLabel}`,
        appearance: "category" as const,
        entries: [
          {
            dayLabel: stage.dayLabel,
            dayNumber: stage.dayNumbers[0],
            itemId: stage.anchor.ref,
            kind: "city" as const,
            title: stage.title,
          },
        ],
        ...(theme && { glyphColor: theme.glyphColor }),
        id: `public-stage:${stage.ref}`,
        itemIds: [stage.anchor.ref],
        label: String(index + 1),
        latitude: stage.anchor.latitude,
        longitude: stage.anchor.longitude,
        readOnly: true,
        selectable: stage.anchor.activity,
        summary: stage.title,
        variantColor: theme?.color ?? itinerary.variant.color,
      },
    ];
  });
  return [...activityMarkers, ...stageMarkers];
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
      const points = routeGeometryCoordinates(leg.geometry);
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
