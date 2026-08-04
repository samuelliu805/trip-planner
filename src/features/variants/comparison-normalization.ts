import type {
  ComparisonCityRow,
  ComparisonDayRow,
  ComparisonPlaceRow,
  ComparisonVariantRow,
  VariantComparisonCity,
  VariantComparisonDay,
  VariantComparisonIdentity,
  VariantComparisonProjection,
} from "./comparison-types";

type PlaceLinkedComparisonCity = ComparisonCityRow & {
  place: ComparisonPlaceRow & { latitude: number; longitude: number };
  place_id: string;
};

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
  const citiesByDay = new Map<string, VariantComparisonCity[]>();

  for (const city of cityRows) {
    if (dayVariantIds.get(city.day_id) !== city.variant_id || !hasValidSnapshot(city)) continue;
    const cities = citiesByDay.get(city.day_id) ?? [];
    cities.push({
      ...(city.place.formatted_address && {
        formattedAddress: city.place.formatted_address,
      }),
      itemId: city.id,
      latitude: city.place.latitude,
      longitude: city.place.longitude,
      placeId: city.place.id,
      placeKey: city.place.google_place_id
        ? `google:${city.place.google_place_id}`
        : `place:${city.place.id}`,
      sortOrder: city.sort_order,
      title: city.title,
    });
    citiesByDay.set(city.day_id, cities);
  }

  const daysByVariant = new Map<string, VariantComparisonDay[]>();
  for (const day of dayRows) {
    if (!variantIds.has(day.variant_id)) continue;
    const days = daysByVariant.get(day.variant_id) ?? [];
    days.push({
      cities: [...(citiesByDay.get(day.id) ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.itemId.localeCompare(b.itemId),
      ),
      date: day.date,
      dayNumber: day.day_number,
      id: day.id,
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
      name: variant.name,
      variantId: variant.id,
    }));
}

export function reconcileVariantComparisonProjections(
  variants: VariantComparisonIdentity[],
  projections: VariantComparisonProjection[] | undefined,
) {
  const byId = new Map(projections?.map((projection) => [projection.variantId, projection]));
  return variants.map((variant): VariantComparisonProjection => {
    const projection = byId.get(variant.id);
    return {
      color: variant.color,
      days: projection?.days ?? [],
      isPrimary: variant.is_primary,
      name: variant.name,
      variantId: variant.id,
    };
  });
}

export function reconcileComparisonVisibility(
  variantIds: string[],
  activeVariantId: string,
  visibleVariantIds: ReadonlySet<string>,
  knownVariantIds: ReadonlySet<string>,
) {
  const visible = new Set<string>();
  for (const variantId of variantIds) {
    if (
      variantId === activeVariantId ||
      visibleVariantIds.has(variantId) ||
      !knownVariantIds.has(variantId)
    )
      visible.add(variantId);
  }
  if (variantIds.includes(activeVariantId)) visible.add(activeVariantId);
  return visible;
}
