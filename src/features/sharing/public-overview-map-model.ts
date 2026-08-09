import { haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";
import type { PlannerMapLine } from "../maps/planner-map-model.ts";
import type { OverviewRouteMode } from "../routes/types.ts";

import type { PublicItinerary, PublicItineraryDay } from "./types";

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
