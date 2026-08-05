import type { PlannerVariant, TransportMode } from "../itinerary/types.ts";
import { transportModeLabels, transportModes } from "../itinerary/types.ts";
import { isOverviewRouteLeg } from "../routes/overview.ts";
import { isRouteLegMode } from "../routes/route-config.ts";
import { parseCalculatedRouteLegs } from "../routes/results.ts";
import { dayRouteStatusFromProjection } from "../routes/status.ts";
import { routeLegModes, type RouteLegMode } from "../routes/types.ts";
import { haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";

import { deriveComparisonStages } from "./comparison-presentation.ts";
import type { VariantComparisonProjection } from "./comparison-types";
import type {
  DecisionSummaryCalculatedPlan,
  DecisionSummaryDayRow,
  DecisionSummaryInput,
  DecisionSummaryItemRow,
  DecisionSummaryModeCount,
  DecisionSummaryRouteCoverage,
  HotelDifference,
  HotelDifferenceEntry,
  HotelOccurrence,
  VariantDecisionSummary,
  VariantDecisionSummaryProjection,
} from "./decision-summary-types";

const plannedPlaceTypes = new Set(["location", "activity", "meal", "hotel", "car_rental"]);

const emptyCoverage = (): DecisionSummaryRouteCoverage => ({
  current: 0,
  currentCalculatedLegCount: 0,
  fallbackLegCount: 0,
  needs_edit: 0,
  noRouteFallbackCount: 0,
  stale: 0,
  totalSavedPlans: 0,
  uncalculated: 0,
  unsupportedModeFallbackCount: 0,
  updating: 0,
});

function validCoordinates(place: DecisionSummaryItemRow["place"]) {
  return Boolean(
    place &&
    place.latitude !== null &&
    place.longitude !== null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    place.latitude >= -90 &&
    place.latitude <= 90 &&
    place.longitude >= -180 &&
    place.longitude <= 180,
  );
}

function placeKey(item: DecisionSummaryItemRow) {
  if (!item.place_id || item.place?.id !== item.place_id) return null;
  return item.place.google_place_id
    ? `google:${item.place.google_place_id}`
    : `place:${item.place.id}`;
}

function citySequenceIdentity(item: DecisionSummaryItemRow) {
  return placeKey(item) ?? `title:${item.title.trim().toLowerCase()}`;
}

function sortedDays(days: DecisionSummaryDayRow[]) {
  return [...days].sort((a, b) => a.day_number - b.day_number || a.id.localeCompare(b.id));
}

function sortedItems(items: DecisionSummaryItemRow[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function derivePlanningHorizon(days: DecisionSummaryDayRow[]) {
  const ordered = sortedDays(days);
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

function explicitTransportMode(item: DecisionSummaryItemRow): TransportMode | null {
  if (item.type === "flight") return "flight";
  if (item.type === "train") return "train";
  if (item.type !== "transport" || !item.details || Array.isArray(item.details)) return null;
  const raw = typeof item.details === "object" ? item.details.mode : undefined;
  if (typeof raw !== "string") return null;
  const aliases: Record<string, TransportMode> = {
    coach: "bus",
    light_rail: "subway",
    metro: "subway",
    rental_car: "self_driving",
  };
  const normalized = aliases[raw] ?? raw;
  return transportModes.includes(normalized as TransportMode)
    ? (normalized as TransportMode)
    : null;
}

function countedModes<TMode extends string>(
  modes: TMode[],
  order: readonly TMode[],
  label: (mode: TMode) => string,
): DecisionSummaryModeCount<TMode>[] {
  const counts = new Map<TMode, number>();
  for (const mode of modes) counts.set(mode, (counts.get(mode) ?? 0) + 1);
  return order.flatMap((mode) => {
    const count = counts.get(mode);
    return count ? [{ count, label: label(mode), mode }] : [];
  });
}

function cityComparisonProjection(
  variantId: string,
  days: DecisionSummaryDayRow[],
  itemsByDay: Map<string, DecisionSummaryItemRow[]>,
): VariantComparisonProjection {
  return {
    color: "#000000",
    days: sortedDays(days).map((day) => ({
      cities: sortedItems(itemsByDay.get(day.id) ?? []).flatMap((item) => {
        const key = item.type === "location" ? placeKey(item) : null;
        if (!key || !validCoordinates(item.place)) return [];
        return [
          {
            itemId: item.id,
            latitude: item.place!.latitude!,
            longitude: item.place!.longitude!,
            placeId: item.place_id!,
            placeKey: key,
            sortOrder: item.sort_order,
            title: item.title,
          },
        ];
      }),
      date: day.date,
      dayNumber: day.day_number,
      id: day.id,
    })),
    isPrimary: false,
    name: "",
    variantId,
  };
}

export function deriveCityMetrics(
  variantId: string,
  days: DecisionSummaryDayRow[],
  itemsByDay: Map<string, DecisionSummaryItemRow[]>,
) {
  const cityItems = sortedDays(days).flatMap((day) =>
    sortedItems(itemsByDay.get(day.id) ?? []).filter(({ type }) => type === "location"),
  );
  const stages = deriveComparisonStages(cityComparisonProjection(variantId, days, itemsByDay));
  const citySpanMeters =
    stages.length < 2
      ? null
      : stages.slice(1).reduce((total, stage, index) => {
          const previous = stages[index];
          return isOverviewRouteLeg(previous, stage)
            ? total +
                haversineDistanceMeters(
                  { latitude: previous.latitude, longitude: previous.longitude },
                  { latitude: stage.latitude, longitude: stage.longitude },
                )
            : total;
        }, 0);
  return {
    citySequence: cityItems.flatMap((item, index) =>
      index > 0 && citySequenceIdentity(cityItems[index - 1]) === citySequenceIdentity(item)
        ? []
        : [item.title],
    ),
    citySpanMeters,
    cityStageCount: cityItems.length,
    uniqueCityPlaceCount: new Set(cityItems.map(placeKey).filter(Boolean)).size,
  };
}

function hotelOccurrence(item: DecisionSummaryItemRow, day: DecisionSummaryDayRow) {
  const normalizedTitle = item.title.trim().toLowerCase();
  return {
    date: day.date,
    dayNumber: day.day_number,
    identity: item.place_id ? `place:${item.place_id}` : `title:${normalizedTitle}`,
    itemId: item.id,
    placeId: item.place_id,
    title: item.title,
  } satisfies HotelOccurrence;
}

function plansForVariant(
  input: DecisionSummaryInput,
  variantId: string,
  days: DecisionSummaryDayRow[],
  items: DecisionSummaryItemRow[],
) {
  const planRows = input.plans
    .filter((plan) => plan.variant_id === variantId)
    .sort((a, b) => a.day_id.localeCompare(b.day_id) || a.id.localeCompare(b.id));
  const projection = {
    days: days.map((day) => ({ dayNumber: day.day_number, id: day.id })),
    items: items.map((item) => ({
      coordinates:
        item.place_id === item.place?.id && validCoordinates(item.place)
          ? { latitude: item.place.latitude!, longitude: item.place.longitude! }
          : null,
      dayId: item.day_id,
      itemId: item.id,
      tripId: item.trip_id,
      type: item.type,
      variantId: item.variant_id,
    })),
  };
  return planRows.map((plan) => {
    const legs = input.legs
      .filter(
        (leg): leg is typeof leg & { mode: RouteLegMode } =>
          leg.plan_id === plan.id && isRouteLegMode(leg.mode),
      )
      .sort((a, b) => a.position - b.position)
      .map(({ from_stop_id, mode, position, to_stop_id }) => ({
        from_stop_id,
        mode,
        position,
        to_stop_id,
      }));
    const stops = input.stops
      .filter((stop) => stop.plan_id === plan.id)
      .sort((a, b) => a.position - b.position);
    const calculationRow = input.calculations.find(({ plan_id }) => plan_id === plan.id);
    const calculatedLegs = calculationRow
      ? parseCalculatedRouteLegs(calculationRow.calculated_legs)
      : null;
    const normalized: DecisionSummaryCalculatedPlan = {
      calculation:
        calculationRow && calculatedLegs
          ? { calculatedLegs, config_signature: calculationRow.config_signature }
          : null,
      day_id: plan.day_id,
      legs,
      stops,
      trip_id: plan.trip_id,
      variant_id: plan.variant_id,
    };
    return { plan: normalized, projection };
  });
}

export function deriveRouteMetrics(
  input: DecisionSummaryInput,
  variantId: string,
  days: DecisionSummaryDayRow[],
  items: DecisionSummaryItemRow[],
) {
  const coverage = emptyCoverage();
  let knownDistance = 0;
  let knownDuration = 0;
  let hasCurrentLeg = false;
  let unknownDurationLegCount = 0;
  const currentModes: RouteLegMode[] = [];
  const distanceByMode = new Map<RouteLegMode, number>();
  for (const { plan, projection } of plansForVariant(input, variantId, days, items)) {
    const status = dayRouteStatusFromProjection(projection, plan);
    coverage[status] += 1;
    coverage.totalSavedPlans += 1;
    if (status !== "current" || !plan.calculation) continue;
    currentModes.push(...plan.legs.map(({ mode }) => mode));
    const modeByPosition = new Map(plan.legs.map(({ mode, position }) => [position, mode]));
    coverage.currentCalculatedLegCount += plan.calculation.calculatedLegs.length;
    for (const leg of plan.calculation.calculatedLegs) {
      hasCurrentLeg = true;
      knownDistance += leg.distanceMeters;
      const savedMode = modeByPosition.get(leg.position);
      if (savedMode)
        distanceByMode.set(savedMode, (distanceByMode.get(savedMode) ?? 0) + leg.distanceMeters);
      if (leg.durationSeconds === null) unknownDurationLegCount += 1;
      else knownDuration += leg.durationSeconds;
      if (leg.geometry.source === "straight") coverage.fallbackLegCount += 1;
      if (leg.fallbackReason === "no_route") coverage.noRouteFallbackCount += 1;
      if (leg.fallbackReason === "unsupported_mode") coverage.unsupportedModeFallbackCount += 1;
    }
  }
  return {
    knownDayRouteDistanceMeters: hasCurrentLeg ? knownDistance : null,
    knownDurationSeconds: hasCurrentLeg ? knownDuration : null,
    routeCoverage: coverage,
    savedDayRouteDistanceByMode: routeLegModes.flatMap((mode) => {
      const distanceMeters = distanceByMode.get(mode);
      return distanceMeters === undefined
        ? []
        : [{ distanceMeters, label: transportModeLabels[mode], mode }];
    }),
    savedDayRouteModes: countedModes(
      currentModes,
      routeLegModes,
      (mode) => transportModeLabels[mode],
    ),
    unknownDurationLegCount,
  };
}

export function deriveVariantDecisionSummaryProjections(
  input: DecisionSummaryInput,
): VariantDecisionSummaryProjection[] {
  const variantIds = new Set(input.variants.map(({ id }) => id));
  const dayVariant = new Map(
    input.days
      .filter(({ variant_id }) => variantIds.has(variant_id))
      .map(({ id, variant_id }) => [id, variant_id]),
  );
  const validItems = input.items.filter(
    (item) => variantIds.has(item.variant_id) && dayVariant.get(item.day_id) === item.variant_id,
  );
  return [...input.variants]
    .sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    )
    .map((variant) => {
      const days = sortedDays(input.days.filter(({ variant_id }) => variant_id === variant.id));
      const items = validItems.filter(({ variant_id }) => variant_id === variant.id);
      const itemsByDay = new Map<string, DecisionSummaryItemRow[]>();
      for (const item of items) {
        const dayItems = itemsByDay.get(item.day_id) ?? [];
        dayItems.push(item);
        itemsByDay.set(item.day_id, dayItems);
      }
      const horizon = derivePlanningHorizon(days);
      const city = deriveCityMetrics(variant.id, days, itemsByDay);
      const route = deriveRouteMetrics(input, variant.id, days, items);
      const placeLinked = items.filter(
        ({ place_id, type }) => Boolean(place_id) && plannedPlaceTypes.has(type),
      );
      const dayById = new Map(days.map((day) => [day.id, day]));
      const hotelOccurrences = items
        .filter(({ type }) => type === "hotel")
        .flatMap((item) => {
          const day = dayById.get(item.day_id);
          return day ? [hotelOccurrence(item, day)] : [];
        })
        .sort(
          (a, b) =>
            a.dayNumber - b.dayNumber ||
            a.identity.localeCompare(b.identity) ||
            a.itemId.localeCompare(b.itemId),
        );
      const tripModes = items
        .filter(({ type }) => ["transport", "flight", "train"].includes(type))
        .map(explicitTransportMode)
        .filter((mode): mode is TransportMode => mode !== null);
      return {
        ...city,
        ...horizon,
        ...route,
        color: variant.color,
        dayDates: days.map(({ date, day_number }) => ({ date, dayNumber: day_number })),
        hotelOccurrences,
        isPrimary: variant.is_primary,
        name: variant.name,
        plannedPlaceOccurrenceCount: placeLinked.length,
        tripTransportModes: countedModes(
          tripModes,
          transportModes,
          (mode) => transportModeLabels[mode],
        ),
        uniquePlannedPlaces: new Set(placeLinked.map(({ place_id }) => place_id)).size,
        variantId: variant.id,
      };
    });
}

function alignmentKey(occurrence: HotelOccurrence, counterpartDays: Map<number, string | null>) {
  const counterpartDate = counterpartDays.get(occurrence.dayNumber);
  return occurrence.date && counterpartDate
    ? `date:${occurrence.date}`
    : `day:${occurrence.dayNumber}`;
}

function alignmentLabel(key: string) {
  return key.startsWith("date:") ? key.slice(5) : `Day ${key.slice(4)}`;
}

export function compareHotelOccurrences(
  primary: VariantDecisionSummaryProjection,
  compared: VariantDecisionSummaryProjection,
): HotelDifference {
  const primaryDays = new Map<number, string | null>();
  const comparedDays = new Map<number, string | null>();
  for (const day of primary.dayDates) primaryDays.set(day.dayNumber, day.date);
  for (const day of compared.dayDates) comparedDays.set(day.dayNumber, day.date);
  const primaryGroups = new Map<string, HotelOccurrence[]>();
  const comparedGroups = new Map<string, HotelOccurrence[]>();
  for (const occurrence of primary.hotelOccurrences) {
    const key = alignmentKey(occurrence, comparedDays);
    primaryGroups.set(key, [...(primaryGroups.get(key) ?? []), occurrence]);
  }
  for (const occurrence of compared.hotelOccurrences) {
    const key = alignmentKey(occurrence, primaryDays);
    comparedGroups.set(key, [...(comparedGroups.get(key) ?? []), occurrence]);
  }
  const entries: HotelDifferenceEntry[] = [];
  const keys = [...new Set([...primaryGroups.keys(), ...comparedGroups.keys()])].sort((a, b) => {
    const aDay = [...(primaryGroups.get(a) ?? []), ...(comparedGroups.get(a) ?? [])].reduce(
      (minimum, occurrence) => Math.min(minimum, occurrence.dayNumber),
      Number.POSITIVE_INFINITY,
    );
    const bDay = [...(primaryGroups.get(b) ?? []), ...(comparedGroups.get(b) ?? [])].reduce(
      (minimum, occurrence) => Math.min(minimum, occurrence.dayNumber),
      Number.POSITIVE_INFINITY,
    );
    return aDay - bDay || a.localeCompare(b);
  });
  for (const key of keys) {
    const primaryRemaining = [...(primaryGroups.get(key) ?? [])];
    const comparedRemaining = [...(comparedGroups.get(key) ?? [])];
    for (let index = comparedRemaining.length - 1; index >= 0; index -= 1) {
      const occurrence = comparedRemaining[index];
      const primaryIndex = primaryRemaining.findIndex(
        ({ identity }) => identity === occurrence.identity,
      );
      if (primaryIndex < 0) continue;
      entries.push({
        alignmentLabel: alignmentLabel(key),
        compared: occurrence,
        primary: primaryRemaining[primaryIndex],
        status: "same",
      });
      comparedRemaining.splice(index, 1);
      primaryRemaining.splice(primaryIndex, 1);
    }
    while (primaryRemaining.length && comparedRemaining.length) {
      entries.push({
        alignmentLabel: alignmentLabel(key),
        compared: comparedRemaining.shift(),
        primary: primaryRemaining.shift(),
        status: "changed",
      });
    }
    for (const occurrence of comparedRemaining)
      entries.push({
        alignmentLabel: alignmentLabel(key),
        compared: occurrence,
        status: "added",
      });
    for (const occurrence of primaryRemaining)
      entries.push({
        alignmentLabel: alignmentLabel(key),
        primary: occurrence,
        status: "removed",
      });
  }
  const count = (status: HotelDifferenceEntry["status"]) =>
    entries.filter((entry) => entry.status === status).length;
  return {
    added: count("added"),
    affectedLabels: [
      ...new Set(
        entries
          .filter(({ status }) => status !== "same")
          .map(({ alignmentLabel }) => alignmentLabel),
      ),
    ],
    changed: count("changed"),
    entries,
    removed: count("removed"),
    same: count("same"),
  };
}

export function reconcileDecisionSummaryProjections(
  variants: PlannerVariant[],
  projections: VariantDecisionSummaryProjection[] | undefined,
) {
  const byId = new Map(projections?.map((projection) => [projection.variantId, projection]));
  return variants.flatMap((variant) => {
    const projection = byId.get(variant.id);
    return projection
      ? [
          {
            ...projection,
            color: variant.color,
            isPrimary: variant.is_primary,
            name: variant.name,
          },
        ]
      : [];
  });
}

export function finalizeVariantDecisionSummaries(
  projections: VariantDecisionSummaryProjection[],
): VariantDecisionSummary[] {
  const primary = projections.find(({ isPrimary }) => isPrimary);
  if (!primary)
    return projections.map((projection) => ({
      ...projection,
      deltas: null,
      hotelDifference: null,
    }));
  return projections.map((projection) => {
    if (projection.variantId === primary.variantId)
      return { ...projection, deltas: null, hotelDifference: null };
    const hotelDifference = compareHotelOccurrences(primary, projection);
    const primaryDistanceByMode = new Map(
      primary.savedDayRouteDistanceByMode.map(({ distanceMeters, mode }) => [mode, distanceMeters]),
    );
    const comparedDistanceByMode = new Map(
      projection.savedDayRouteDistanceByMode.map(({ distanceMeters, mode }) => [
        mode,
        distanceMeters,
      ]),
    );
    return {
      ...projection,
      deltas: {
        citySpanMeters:
          projection.citySpanMeters === null || primary.citySpanMeters === null
            ? null
            : projection.citySpanMeters - primary.citySpanMeters,
        cityStages: projection.cityStageCount - primary.cityStageCount,
        dayRouteDistanceByMode:
          projection.knownDayRouteDistanceMeters === null ||
          primary.knownDayRouteDistanceMeters === null
            ? null
            : routeLegModes.flatMap((mode) =>
                primaryDistanceByMode.has(mode) || comparedDistanceByMode.has(mode)
                  ? [
                      {
                        distanceMeters:
                          (comparedDistanceByMode.get(mode) ?? 0) -
                          (primaryDistanceByMode.get(mode) ?? 0),
                        label: transportModeLabels[mode],
                        mode,
                      },
                    ]
                  : [],
              ),
        days: projection.dayCount - primary.dayCount,
        hotelAdded: hotelDifference.added,
        hotelChanged: hotelDifference.changed,
        hotelRemoved: hotelDifference.removed,
        knownDayRouteDistanceMeters:
          projection.knownDayRouteDistanceMeters === null ||
          primary.knownDayRouteDistanceMeters === null
            ? null
            : projection.knownDayRouteDistanceMeters - primary.knownDayRouteDistanceMeters,
        knownDurationSeconds:
          projection.knownDurationSeconds === null ||
          primary.knownDurationSeconds === null ||
          projection.unknownDurationLegCount > 0 ||
          primary.unknownDurationLegCount > 0
            ? null
            : projection.knownDurationSeconds - primary.knownDurationSeconds,
        nights:
          projection.nightCount === null || primary.nightCount === null
            ? null
            : projection.nightCount - primary.nightCount,
        uniqueCityPlaces: projection.uniqueCityPlaceCount - primary.uniqueCityPlaceCount,
        uniquePlannedPlaces: projection.uniquePlannedPlaces - primary.uniquePlannedPlaces,
      },
      hotelDifference,
    };
  });
}
