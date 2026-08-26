import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";
import {
  compareManualDayOrder,
  compareManualItemOrder,
  localityKey,
  usableCoordinate,
  type ActivityLocality,
  type DayLocalityProjection,
  type DayOverviewCluster,
  type OverviewAnchor,
  type OverviewStageProjection,
} from "./locality-foundation.ts";

export {
  compareManualDayOrder,
  compareManualItemOrder,
  formatDayLocalitySummary,
  normalizeLocalityLabel,
} from "./locality-foundation.ts";
export type {
  ActivityLocality,
  DayLocalityProjection,
  DayOverviewCluster,
  OverviewAnchor,
  OverviewStageProjection,
} from "./locality-foundation.ts";

const canonicalLocalityTypes = new Set<ItineraryItem["type"]>([
  "activity",
  "car_rental",
  "hotel",
  "meal",
]);

function activityLocality(item: ItineraryItem): ActivityLocality | null {
  const label = item.place?.localityName?.trim();
  if (!label || !item.place || !canonicalLocalityTypes.has(item.type)) return null;
  const hasCoordinate = usableCoordinate(item.place.latitude, item.place.longitude);
  return {
    countryCode: item.place.countryCode,
    itemId: item.id,
    key: localityKey(label, item.place.countryCode),
    label,
    ...(hasCoordinate && {
      latitude: item.place.latitude,
      longitude: item.place.longitude,
    }),
    placeId: item.place.id,
    source: "activity",
  };
}

function legacyLocality(item: ItineraryItem): ActivityLocality | null {
  if (item.type !== "location") return null;
  const label =
    item.place?.localityName?.trim() || item.place?.displayName?.trim() || item.title.trim();
  if (!label) return null;
  const hasCoordinate = usableCoordinate(item.place?.latitude, item.place?.longitude);
  return {
    countryCode: item.place?.countryCode,
    itemId: item.id,
    key: localityKey(label, item.place?.countryCode),
    label,
    ...(hasCoordinate && {
      latitude: item.place?.latitude,
      longitude: item.place?.longitude,
    }),
    ...(item.place && { placeId: item.place.id }),
    source: "legacy_city",
  };
}

function deduplicateAdjacentLocalities(localities: ActivityLocality[]) {
  return localities.filter((locality, index) => locality.key !== localities[index - 1]?.key);
}

export function deriveDayLocality(day: PlannerDay): DayLocalityProjection {
  const orderedItems = [...day.items].sort(compareManualItemOrder);
  const canonicalEvidence = orderedItems.flatMap((item) => {
    const locality = activityLocality(item);
    return locality ? [locality] : [];
  });
  const legacyEvidence = orderedItems.flatMap((item) => {
    const locality = legacyLocality(item);
    return locality ? [locality] : [];
  });
  const evidence = canonicalEvidence.length ? canonicalEvidence : legacyEvidence;
  const localities = deduplicateAdjacentLocalities(evidence);

  const stayLocality = [...orderedItems]
    .reverse()
    .find((item) => item.type === "hotel" && activityLocality(item));
  let primaryLocality = stayLocality ? activityLocality(stayLocality) : null;

  if (!primaryLocality && evidence.length) {
    const frequency = new Map<string, number>();
    evidence.forEach((locality) =>
      frequency.set(locality.key, (frequency.get(locality.key) ?? 0) + 1),
    );
    primaryLocality = evidence.reduce((best, candidate) =>
      (frequency.get(candidate.key) ?? 0) > (frequency.get(best.key) ?? 0) ? candidate : best,
    );
  }

  return {
    dayId: day.id,
    localities,
    primaryLocality,
    usedLegacyFallback: canonicalEvidence.length === 0 && legacyEvidence.length > 0,
  };
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function angularDistance(a: OverviewAnchor, b: OverviewAnchor) {
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function representativeAnchor(points: OverviewAnchor[]) {
  if (points.length < 2) return points[0] ?? null;
  return points.reduce((best, candidate) => {
    const candidateDistance = points.reduce(
      (sum, point) => sum + angularDistance(candidate, point),
      0,
    );
    const bestDistance = points.reduce((sum, point) => sum + angularDistance(best, point), 0);
    return candidateDistance < bestDistance ? candidate : best;
  });
}

export function representativeActivityAnchor(days: PlannerDay[]): OverviewAnchor | null {
  const canonical = days.flatMap((day) =>
    [...day.items].sort(compareManualItemOrder).flatMap((item): OverviewAnchor[] => {
      if (
        item.type === "location" ||
        !canonicalLocalityTypes.has(item.type) ||
        !item.place ||
        !usableCoordinate(item.place.latitude, item.place.longitude)
      )
        return [];
      return [
        {
          itemId: item.id,
          latitude: item.place.latitude,
          longitude: item.place.longitude,
          placeId: item.place.id,
        },
      ];
    }),
  );
  const legacy = days.flatMap((day) =>
    [...day.items].sort(compareManualItemOrder).flatMap((item): OverviewAnchor[] => {
      if (
        item.type !== "location" ||
        !item.place ||
        !usableCoordinate(item.place.latitude, item.place.longitude)
      )
        return [];
      return [
        {
          itemId: item.id,
          latitude: item.place.latitude,
          longitude: item.place.longitude,
          placeId: item.place.id,
        },
      ];
    }),
  );
  const points = canonical.length ? canonical : legacy;
  return representativeAnchor(points);
}

/**
 * Groups neighboring itinerary places by locality. A later return to a locality starts a new
 * cluster so the inferred route keeps its actual A → B → A order.
 */
export function deriveDayOverviewClusters(day: PlannerDay): DayOverviewCluster[] {
  const orderedItems = [...day.items].sort(compareManualItemOrder);
  const canonical = orderedItems.flatMap((item) => {
    const locality = activityLocality(item);
    return locality ? [{ item, locality }] : [];
  });
  const legacy = orderedItems.flatMap((item) => {
    const locality = legacyLocality(item);
    return locality ? [{ item, locality }] : [];
  });
  const evidence = canonical.length ? canonical : legacy;
  const groups: Array<{
    itemIds: string[];
    locality: ActivityLocality;
    points: OverviewAnchor[];
  }> = [];

  for (const { item, locality } of evidence) {
    const previous = groups.at(-1);
    const group =
      previous?.locality.key === locality.key ? previous : { itemIds: [], locality, points: [] };
    group.itemIds.push(item.id);
    if (locality.placeId && locality.latitude !== undefined && locality.longitude !== undefined)
      group.points.push({
        itemId: item.id,
        latitude: locality.latitude,
        longitude: locality.longitude,
        placeId: locality.placeId,
      });
    if (group !== previous) groups.push(group);
  }

  const seen = new Set<string>();
  return groups.map((group): DayOverviewCluster => {
    const returning = seen.has(group.locality.key);
    seen.add(group.locality.key);
    return {
      anchor: representativeAnchor(group.points),
      itemIds: group.itemIds,
      locality: group.locality,
      returning,
    };
  });
}

function stageSecondaryLocalities(days: PlannerDay[], primary: ActivityLocality | null) {
  const all = days.flatMap((day) => deriveDayLocality(day).localities);
  return deduplicateAdjacentLocalities(all).filter((locality) => locality.key !== primary?.key);
}

function finalizeStage(stage: Omit<OverviewStageProjection, "anchor" | "secondaryLocalities">) {
  return {
    ...stage,
    anchor: representativeActivityAnchor(stage.days),
    secondaryLocalities: stageSecondaryLocalities(stage.days, stage.primaryLocality),
  } satisfies OverviewStageProjection;
}

export function deriveOverviewStageProjections(days: PlannerDay[]): OverviewStageProjection[] {
  const orderedDays = [...days].sort(compareManualDayOrder);
  const stages: OverviewStageProjection[] = [];
  orderedDays.forEach((day, index) => {
    const primaryLocality = deriveDayLocality(day).primaryLocality;
    const previous = stages.at(-1);
    if (primaryLocality && previous?.primaryLocality?.key === primaryLocality.key) {
      const combinedDays = [...previous.days, day];
      stages[stages.length - 1] = finalizeStage({
        dayIds: [...previous.dayIds, day.id],
        days: combinedDays,
        firstDayIndex: previous.firstDayIndex,
        id: previous.id,
        lastDayIndex: index,
        primaryLocality: previous.primaryLocality,
      });
      return;
    }
    stages.push(
      finalizeStage({
        dayIds: [day.id],
        days: [day],
        firstDayIndex: index,
        id: `overview-stage:${day.id}`,
        lastDayIndex: index,
        primaryLocality,
      }),
    );
  });
  return stages;
}
