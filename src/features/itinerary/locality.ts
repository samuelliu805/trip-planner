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

const canonicalActivityTypes = new Set<ItineraryItem["type"]>(["activity", "meal", "hotel"]);

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

function localityKey(label: string, countryCode?: string) {
  return `${countryCode?.toUpperCase() ?? ""}:${normalizeLocalityLabel(label)}`;
}

function usableCoordinate(latitude?: number, longitude?: number) {
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

function activityLocality(item: ItineraryItem): ActivityLocality | null {
  const label = item.place?.localityName?.trim();
  if (!label || !item.place || !canonicalActivityTypes.has(item.type)) return null;
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

function deduplicateFirstAppearance(localities: ActivityLocality[]) {
  const seen = new Set<string>();
  return localities.filter((locality) => {
    if (seen.has(locality.key)) return false;
    seen.add(locality.key);
    return true;
  });
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
  const localities = deduplicateFirstAppearance(evidence);

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

export function formatDayLocalitySummary(projection: DayLocalityProjection, maximumVisible = 2) {
  if (!projection.localities.length) return "Locality unavailable";
  const visible = projection.localities.slice(0, maximumVisible).map(({ label }) => label);
  const remaining = projection.localities.length - visible.length;
  return remaining > 0 ? `${visible.join(" · ")} · +${remaining}` : visible.join(" · ");
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
        !canonicalActivityTypes.has(item.type) ||
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
 * Groups a Day's Activity places by locality, preserving first appearance. When the final Hotel
 * returns to the base locality after an intermediate stop, the return is retained as the final
 * cluster instead of being globally deduplicated.
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
  const groups = new Map<
    string,
    { itemIds: string[]; locality: ActivityLocality; points: OverviewAnchor[] }
  >();

  for (const { item, locality } of evidence) {
    const group = groups.get(locality.key) ?? { itemIds: [], locality, points: [] };
    group.itemIds.push(item.id);
    if (locality.placeId && locality.latitude !== undefined && locality.longitude !== undefined)
      group.points.push({
        itemId: item.id,
        latitude: locality.latitude,
        longitude: locality.longitude,
        placeId: locality.placeId,
      });
    groups.set(locality.key, group);
  }

  const clusters = [...groups.values()].map((group): DayOverviewCluster => ({
    anchor: representativeAnchor(group.points),
    itemIds: group.itemIds,
    locality: group.locality,
    returning: false,
  }));
  const primary = deriveDayLocality(day).primaryLocality;
  const finalEvidence = evidence.at(-1);
  const primaryGroup = primary ? groups.get(primary.key) : undefined;
  if (
    clusters.length > 1 &&
    primary &&
    primaryGroup &&
    finalEvidence?.locality.key === primary.key &&
    clusters.at(-1)?.locality.key !== primary.key
  ) {
    const locality = finalEvidence.locality;
    const returnAnchor =
      locality.placeId && locality.latitude !== undefined && locality.longitude !== undefined
        ? {
            itemId: finalEvidence.item.id,
            latitude: locality.latitude,
            longitude: locality.longitude,
            placeId: locality.placeId,
          }
        : representativeAnchor(primaryGroup.points);
    clusters.push({
      anchor: returnAnchor,
      itemIds: [finalEvidence.item.id],
      locality,
      returning: true,
    });
  }
  return clusters;
}

function stageSecondaryLocalities(days: PlannerDay[], primary: ActivityLocality | null) {
  const all = days.flatMap((day) => deriveDayLocality(day).localities);
  return deduplicateFirstAppearance(all).filter((locality) => locality.key !== primary?.key);
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
