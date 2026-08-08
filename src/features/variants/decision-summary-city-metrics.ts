import { haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";
import {
  sortedDecisionSummaryDays,
  sortedDecisionSummaryItems,
} from "./decision-summary-normalization.ts";
import type { DecisionSummaryDayRow, DecisionSummaryItemRow } from "./decision-summary-types.ts";

export function derivePlanningHorizon(days: DecisionSummaryDayRow[]) {
  const ordered = sortedDecisionSummaryDays(days);
  if (!ordered.length || ordered.some(({ date }) => !date)) {
    return {
      dayCount: ordered.length,
      nightCount: null,
      nightUnknownReason: "Dates incomplete" as const,
    };
  }
  const dates = ordered.map(({ date }) => Date.parse(`${date}T00:00:00Z`));
  const continuous = dates.every(
    (date, index) => index === 0 || date - dates[index - 1] === 86_400_000,
  );
  return {
    dayCount: ordered.length,
    nightCount: continuous ? Math.max(0, ordered.length - 1) : null,
    nightUnknownReason: continuous ? null : ("Dates not continuous" as const),
  };
}

const activityTypes = new Set<DecisionSummaryItemRow["type"]>(["activity", "meal", "hotel"]);

function locality(item: DecisionSummaryItemRow) {
  const label =
    item.place?.locality_name?.trim() || (item.type === "location" ? item.title.trim() : "");
  return label
    ? {
        key: `${item.place?.country_code?.toUpperCase() ?? ""}:${label
          .normalize("NFKC")
          .trim()
          .replace(/\s+/g, " ")
          .toLocaleLowerCase("en")}`,
        label,
      }
    : null;
}

function validPoint(item: DecisionSummaryItemRow) {
  const { latitude, longitude } = item.place ?? {};
  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function stageProjection(
  days: DecisionSummaryDayRow[],
  itemsByDay: Map<string, DecisionSummaryItemRow[]>,
) {
  return sortedDecisionSummaryDays(days).reduce<
    Array<{
      key: string;
      label: string;
      points: Array<{ latitude: number; longitude: number }>;
    }>
  >((stages, day) => {
    const ordered = sortedDecisionSummaryItems(itemsByDay.get(day.id) ?? []);
    const canonical = ordered.filter((item) => activityTypes.has(item.type) && locality(item));
    const evidence = canonical.length
      ? canonical
      : ordered.filter((item) => item.type === "location" && locality(item));
    const stay = [...evidence].reverse().find(({ type }) => type === "hotel");
    const counts = new Map<string, number>();
    evidence.forEach((item) => {
      const key = locality(item)!.key;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const primary =
      stay ??
      evidence.reduce<DecisionSummaryItemRow | undefined>((best, candidate) => {
        if (!best) return candidate;
        return (counts.get(locality(candidate)!.key) ?? 0) > (counts.get(locality(best)!.key) ?? 0)
          ? candidate
          : best;
      }, undefined);
    if (!primary) return stages;
    const resolved = locality(primary)!;
    const canonicalPoints = ordered.filter(
      (item) => item.type !== "location" && activityTypes.has(item.type) && validPoint(item),
    );
    const coordinateSources = canonicalPoints.length
      ? canonicalPoints
      : ordered.filter((item) => item.type === "location" && validPoint(item));
    const points = coordinateSources.map((item) => ({
      latitude: item.place!.latitude!,
      longitude: item.place!.longitude!,
    }));
    const previous = stages.at(-1);
    if (previous?.key === resolved.key) previous.points.push(...points);
    else stages.push({ ...resolved, points });
    return stages;
  }, []);
}

function representativePoint(points: Array<{ latitude: number; longitude: number }>) {
  if (!points.length) return null;
  return points.reduce((best, candidate) => {
    const total = (source: typeof candidate) =>
      points.reduce(
        (sum, target) =>
          sum +
          haversineDistanceMeters(
            { latitude: source.latitude, longitude: source.longitude },
            { latitude: target.latitude, longitude: target.longitude },
          ),
        0,
      );
    return total(candidate) < total(best) ? candidate : best;
  });
}

export function deriveCityMetrics(
  _variantId: string,
  days: DecisionSummaryDayRow[],
  itemsByDay: Map<string, DecisionSummaryItemRow[]>,
) {
  const stages = stageProjection(days, itemsByDay);
  const anchors = stages.map(({ points }) => representativePoint(points));
  const citySpanMeters =
    anchors.filter(Boolean).length < 2
      ? null
      : anchors.slice(1).reduce((total, anchor, index) => {
          const previous = anchors[index];
          return anchor && previous ? total + haversineDistanceMeters(previous, anchor) : total;
        }, 0);
  return {
    citySequence: stages.map(({ label }) => label),
    citySpanMeters,
    cityStageCount: stages.length,
    uniqueCityPlaceCount: new Set(stages.map(({ key }) => key)).size,
  };
}
