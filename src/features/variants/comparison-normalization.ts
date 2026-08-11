import type {
  ComparisonCityRow,
  ComparisonDayRow,
  ComparisonPlaceRow,
  ComparisonRouteCalculationRow,
  ComparisonRoutePlanRow,
  ComparisonRouteStopRow,
  ComparisonVariantRow,
  VariantComparisonCity,
  VariantComparisonDay,
  VariantComparisonProjection,
  VariantComparisonRouteStop,
} from "./comparison-types";
import { parseCalculatedRouteLegs } from "../routes/results.ts";

export {
  reconcileComparisonVisibility,
  reconcileVariantComparisonProjections,
} from "./comparison-reconciliation.ts";

type PlaceLinkedComparisonCity = ComparisonCityRow & {
  place: ComparisonPlaceRow & { latitude: number; longitude: number };
  place_id: string;
};

const canonicalTypes = new Set<ComparisonCityRow["type"]>(["activity", "meal", "hotel"]);

function localityKey(city: ComparisonCityRow) {
  const label =
    city.place?.locality_name?.trim() || (city.type === "location" ? city.title.trim() : "");
  return label
    ? `${city.place?.country_code?.toUpperCase() ?? ""}:${label
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en")}`
    : null;
}

function hasValidSnapshot(city: ComparisonCityRow): city is PlaceLinkedComparisonCity {
  const place = city.place;
  return Boolean(
    city.place_id &&
    place &&
    place.id === city.place_id &&
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

function representativeComparisonCity(cities: PlaceLinkedComparisonCity[]) {
  return cities.reduce((best, candidate) => {
    const distance = (source: PlaceLinkedComparisonCity) =>
      cities.reduce((sum, target) => {
        const latitudeDelta = ((target.place.latitude - source.place.latitude) * Math.PI) / 180;
        const longitudeDelta = ((target.place.longitude - source.place.longitude) * Math.PI) / 180;
        const latitudeA = (source.place.latitude * Math.PI) / 180;
        const latitudeB = (target.place.latitude * Math.PI) / 180;
        const haversine =
          Math.sin(latitudeDelta / 2) ** 2 +
          Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
        return sum + 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
      }, 0);
    return distance(candidate) < distance(best) ? candidate : best;
  });
}

export function normalizeVariantComparisonProjection(
  variantRows: ComparisonVariantRow[],
  dayRows: ComparisonDayRow[],
  cityRows: ComparisonCityRow[],
): VariantComparisonProjection[] {
  const variantIds = new Set(variantRows.map(({ id }) => id));
  const dayVariantIds = new Map(
    dayRows
      .filter(({ variant_id }) => variantIds.has(variant_id))
      .map(({ id, variant_id }) => [id, variant_id]),
  );
  const sourcesByDay = new Map<string, ComparisonCityRow[]>();

  for (const city of cityRows) {
    if (dayVariantIds.get(city.day_id) !== city.variant_id) continue;
    const sources = sourcesByDay.get(city.day_id) ?? [];
    sources.push(city);
    sourcesByDay.set(city.day_id, sources);
  }

  const daysByVariant = new Map<string, VariantComparisonDay[]>();
  for (const day of dayRows) {
    if (!variantIds.has(day.variant_id)) continue;
    const ordered = [...(sourcesByDay.get(day.id) ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
    );
    const canonicalLocalities = ordered.filter(
      (item) => canonicalTypes.has(item.type) && localityKey(item),
    );
    const localitySources = canonicalLocalities.length
      ? canonicalLocalities
      : ordered.filter((item) => item.type === "location" && localityKey(item));
    const stay = [...localitySources].reverse().find(({ type }) => type === "hotel");
    const frequency = new Map<string, number>();
    localitySources.forEach((item) => {
      const key = localityKey(item)!;
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    });
    const primary =
      stay ??
      localitySources.reduce<ComparisonCityRow | undefined>((best, candidate) => {
        if (!best) return candidate;
        return (frequency.get(localityKey(candidate)!) ?? 0) >
          (frequency.get(localityKey(best)!) ?? 0)
          ? candidate
          : best;
      }, undefined);
    const canonicalCoordinates = ordered.filter(
      (item) => item.type !== "location" && canonicalTypes.has(item.type) && hasValidSnapshot(item),
    ) as PlaceLinkedComparisonCity[];
    const localityGroups = new Map<
      string,
      { items: ComparisonCityRow[]; points: PlaceLinkedComparisonCity[] }
    >();
    for (const item of localitySources) {
      const key = localityKey(item)!;
      const group = localityGroups.get(key) ?? { items: [], points: [] };
      group.items.push(item);
      if (hasValidSnapshot(item)) group.points.push(item);
      localityGroups.set(key, group);
    }
    const cities: VariantComparisonCity[] = [...localityGroups.entries()].flatMap(
      ([placeKey, group]): VariantComparisonCity[] => {
        if (!group.points.length) return [];
        const anchor = representativeComparisonCity(group.points);
        const first = group.items[0];
        return [
          {
            ...(anchor.place.formatted_address && {
              formattedAddress: anchor.place.formatted_address,
            }),
            itemId: anchor.id,
            latitude: anchor.place.latitude,
            longitude: anchor.place.longitude,
            placeId: anchor.place.id,
            placeKey,
            sortOrder: first.sort_order,
            title: first.place?.locality_name?.trim() || first.title,
          },
        ];
      },
    );
    const finalLocality = localitySources.at(-1);
    const primaryKey = primary ? localityKey(primary) : null;
    if (
      cities.length > 1 &&
      finalLocality &&
      primaryKey &&
      localityKey(finalLocality) === primaryKey &&
      cities.at(-1)?.placeKey !== primaryKey
    ) {
      const primaryGroup = localityGroups.get(primaryKey);
      const anchor = hasValidSnapshot(finalLocality)
        ? finalLocality
        : primaryGroup?.points.length
          ? representativeComparisonCity(primaryGroup.points)
          : undefined;
      if (anchor)
        cities.push({
          ...(anchor.place.formatted_address && {
            formattedAddress: anchor.place.formatted_address,
          }),
          itemId: anchor.id,
          latitude: anchor.place.latitude,
          longitude: anchor.place.longitude,
          placeId: anchor.place.id,
          placeKey: primaryKey,
          sortOrder: finalLocality.sort_order,
          title: finalLocality.place?.locality_name?.trim() || finalLocality.title,
        });
    }
    const routeStops: VariantComparisonRouteStop[] = canonicalCoordinates.map((item) => ({
      ...(item.place.formatted_address && { formattedAddress: item.place.formatted_address }),
      itemId: item.id,
      latitude: item.place.latitude,
      longitude: item.place.longitude,
      placeId: item.place.id,
      sortOrder: item.sort_order,
      title: item.title,
      type: item.type as VariantComparisonRouteStop["type"],
    }));
    const days = daysByVariant.get(day.variant_id) ?? [];
    days.push({
      cities,
      date: day.date,
      dayNumber: day.day_number,
      id: day.id,
      route: { calculatedLegs: [], saved: false, stops: routeStops },
    });
    daysByVariant.set(day.variant_id, days);
  }

  return [...variantRows]
    .sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    )
    .map((variant) => ({
      color: variant.color,
      days: [...(daysByVariant.get(variant.id) ?? [])].sort(
        (a, b) => a.dayNumber - b.dayNumber || a.id.localeCompare(b.id),
      ),
      isPrimary: variant.is_primary,
      knownCost: [],
      name: variant.name,
      variantId: variant.id,
    }));
}

export function attachVariantComparisonDayRoutes(
  projections: VariantComparisonProjection[],
  cityRows: ComparisonCityRow[],
  plans: ComparisonRoutePlanRow[],
  stops: ComparisonRouteStopRow[],
  calculations: ComparisonRouteCalculationRow[],
) {
  const itemsById = new Map(
    cityRows
      .filter(
        (item): item is PlaceLinkedComparisonCity =>
          canonicalTypes.has(item.type) && hasValidSnapshot(item),
      )
      .map((item) => [item.id, item]),
  );
  const stopsByPlan = new Map<string, ComparisonRouteStopRow[]>();
  for (const stop of stops) {
    const planStops = stopsByPlan.get(stop.plan_id) ?? [];
    planStops.push(stop);
    stopsByPlan.set(stop.plan_id, planStops);
  }
  const calculationsByPlan = new Map(calculations.map((row) => [row.plan_id, row]));
  const plansByDay = new Map(plans.map((plan) => [plan.day_id, plan]));

  return projections.map((projection) => ({
    ...projection,
    days: projection.days.map((day) => {
      const plan = plansByDay.get(day.id);
      if (!plan || plan.variant_id !== projection.variantId) return day;
      const routeStops = [...(stopsByPlan.get(plan.id) ?? [])]
        .sort((a, b) => a.position - b.position)
        .flatMap((stop): VariantComparisonRouteStop[] => {
          const item = itemsById.get(stop.item_id);
          if (!item || item.variant_id !== projection.variantId) return [];
          return [
            {
              ...(item.place.formatted_address && {
                formattedAddress: item.place.formatted_address,
              }),
              itemId: item.id,
              latitude: item.place.latitude,
              longitude: item.place.longitude,
              placeId: item.place.id,
              sortOrder: stop.position,
              title: item.title,
              type: item.type as VariantComparisonRouteStop["type"],
            },
          ];
        });
      const calculation = calculationsByPlan.get(plan.id);
      return {
        ...day,
        route: {
          calculatedLegs: calculation
            ? (parseCalculatedRouteLegs(calculation.calculated_legs) ?? [])
            : [],
          saved: true,
          stops: routeStops,
        },
      };
    }),
  }));
}
