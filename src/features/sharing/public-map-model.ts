import { decodeEncodedPolyline, haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";
import type { PlannerMapLine, PlannerMapMarker } from "../maps/planner-map-model.ts";
import type { OverviewRouteMode } from "../routes/types.ts";

import type {
  PublicItinerary,
  PublicItineraryDay,
  PublicRouteCalculation,
  PublicSavedRoute,
} from "./types";

function markerKind(type: string): "activity" | "carRental" | "city" | "hotel" | "meal" {
  if (type === "location") return "city";
  if (type === "hotel") return "hotel";
  if (type === "meal") return "meal";
  if (type === "car_rental") return "carRental";
  return "activity";
}

export function buildPublicMarkers(itinerary: PublicItinerary): PlannerMapMarker[] {
  const activityMarkers = itinerary.days.flatMap((day) =>
    day.items.flatMap((item) => {
      if (item.type === "location") return [];
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
  const stageMarkers = derivePublicOverviewStages(itinerary).flatMap((stage, index) => {
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
        id: `public-stage:${stage.ref}`,
        itemIds: [stage.anchor.ref],
        label: String(index + 1),
        latitude: stage.anchor.latitude,
        longitude: stage.anchor.longitude,
        readOnly: true,
        selectable: stage.anchor.activity,
        summary: stage.title,
        variantColor: itinerary.variant.color,
      },
    ];
  });
  return [...activityMarkers, ...stageMarkers];
}

type PublicAnchor = {
  activity: boolean;
  latitude: number;
  longitude: number;
  ref: string;
};

function publicLocalityKey(value?: string) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en") ?? "";
}

function publicMedoid(points: PublicAnchor[]) {
  if (points.length < 2) return points[0] ?? null;
  return points.reduce((best, candidate) => {
    const total = (point: PublicAnchor) =>
      points.reduce(
        (sum, other) =>
          sum +
          haversineDistanceMeters(
            { latitude: point.latitude, longitude: point.longitude },
            { latitude: other.latitude, longitude: other.longitude },
          ),
        0,
      );
    return total(candidate) < total(best) ? candidate : best;
  });
}

function orderedPublicItems(day: PublicItineraryDay) {
  return [...day.items].sort((left, right) => {
    if (left.type === "hotel" && right.type !== "hotel") return 1;
    if (left.type !== "hotel" && right.type === "hotel") return -1;
    return left.sortOrder - right.sortOrder || left.ref.localeCompare(right.ref);
  });
}

function publicDayClusters(itinerary: PublicItinerary, day: PublicItineraryDay) {
  const ordered = orderedPublicItems(day);
  const canonical = ordered.flatMap((item) => {
    const title = ["activity", "meal", "hotel"].includes(item.type)
      ? item.place?.localityName?.trim()
      : undefined;
    return title &&
      typeof item.place?.latitude === "number" &&
      typeof item.place.longitude === "number"
      ? [{ item, key: publicLocalityKey(title), title }]
      : [];
  });
  const legacyItems = ordered.flatMap((item) => {
    const title =
      item.type === "location"
        ? item.place?.localityName?.trim() || item.place?.displayName?.trim() || item.title.trim()
        : undefined;
    return title &&
      typeof item.place?.latitude === "number" &&
      typeof item.place.longitude === "number"
      ? [{ item, key: publicLocalityKey(title), title }]
      : [];
  });
  const legacySequence = itinerary.citySequence.flatMap((entry) =>
    entry.dayNumber === day.dayNumber &&
    typeof entry.latitude === "number" &&
    typeof entry.longitude === "number"
      ? [
          {
            item: {
              place: {
                displayName: entry.name,
                latitude: entry.latitude,
                longitude: entry.longitude,
              },
              ref: entry.ref,
            },
            key: publicLocalityKey(entry.name),
            title: entry.name,
          },
        ]
      : [],
  );
  const evidence = canonical.length ? canonical : legacyItems.length ? legacyItems : legacySequence;
  const groups = new Map<string, { points: PublicAnchor[]; refs: string[]; title: string }>();
  evidence.forEach(({ item, key, title }) => {
    const group = groups.get(key) ?? { points: [], refs: [], title };
    group.refs.push(item.ref);
    group.points.push({
      activity: canonical.length > 0,
      latitude: item.place!.latitude!,
      longitude: item.place!.longitude!,
      ref: item.ref,
    });
    groups.set(key, group);
  });
  const clusters = [...groups.entries()].map(([key, group]) => ({
    anchor: publicMedoid(group.points),
    key,
    ref: group.refs[0],
    title: group.title,
  }));
  const primaryKey = publicLocalityKey(day.primaryLocality);
  const finalEvidence = evidence.at(-1);
  const primaryGroup = groups.get(primaryKey);
  if (
    clusters.length > 1 &&
    finalEvidence?.key === primaryKey &&
    clusters.at(-1)?.key !== primaryKey &&
    primaryGroup
  )
    clusters.push({
      anchor: {
        activity: canonical.length > 0,
        latitude: finalEvidence.item.place!.latitude!,
        longitude: finalEvidence.item.place!.longitude!,
        ref: finalEvidence.item.ref,
      },
      key: primaryKey,
      ref: finalEvidence.item.ref,
      title: finalEvidence.title,
    });
  return clusters;
}

export function derivePublicOverviewStages(itinerary: PublicItinerary) {
  const stages: Array<{
    anchor: PublicAnchor | null;
    dayLabel: string;
    dayNumbers: number[];
    ref: string;
    title: string;
  }> = [];
  itinerary.days.forEach((day) => {
    publicDayClusters(itinerary, day).forEach((cluster) => {
      const previous = stages.at(-1);
      if (
        previous &&
        publicLocalityKey(previous.title) === cluster.key &&
        previous.dayNumbers.at(-1) === day.dayNumber - 1
      ) {
        if (!previous.dayNumbers.includes(day.dayNumber)) previous.dayNumbers.push(day.dayNumber);
        const first = previous.dayNumbers[0];
        previous.dayLabel =
          first === day.dayNumber ? `Day ${first}` : `Days ${first}–${day.dayNumber}`;
        return;
      }
      stages.push({
        anchor: cluster.anchor,
        dayLabel: `Day ${day.dayNumber}`,
        dayNumbers: [day.dayNumber],
        ref: cluster.ref,
        title: cluster.title,
      });
    });
  });
  return stages;
}

export function publicOverviewStops(itinerary: PublicItinerary) {
  return derivePublicOverviewStages(itinerary).flatMap((stage) =>
    stage.anchor
      ? [
          {
            dayNumber: stage.dayNumbers[0],
            latitude: stage.anchor.latitude,
            longitude: stage.anchor.longitude,
            ref: stage.ref,
            title: stage.title,
          },
        ]
      : [],
  );
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
