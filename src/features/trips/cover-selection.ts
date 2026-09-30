export type TripCoverSource = {
  name: string;
  placeId: string;
  googlePlaceId?: string;
  dayCount: number;
};

export type TripCoverCandidate = {
  day_id: string | null;
  sort_order: number;
  type: string;
  place: {
    id: string;
    source: string;
    display_name: string;
    locality_name: string | null;
    country_code: string | null;
    google_place_id: string | null;
  } | null;
};

/** Prefer the town occupied on most distinct days; repeated stops never increase its weight. */
export function selectTripCover(candidates: TripCoverCandidate[]): TripCoverSource | undefined {
  const towns = new Map<string, { days: Set<string>; source: TripCoverCandidate["place"] }>();
  for (const item of candidates.slice().sort((a, b) => a.sort_order - b.sort_order)) {
    if (
      !item.day_id ||
      !item.place ||
      !["location", "hotel", "activity", "meal"].includes(item.type)
    )
      continue;
    const town = item.place.locality_name?.trim();
    if (!town) continue;
    const key = `${item.place.country_code ?? ""}:${town.toLocaleLowerCase()}`;
    const existing = towns.get(key);
    if (existing) {
      existing.days.add(item.day_id);
      if (
        item.type === "location" &&
        item.place.display_name.trim().toLocaleLowerCase() === town.toLocaleLowerCase()
      )
        existing.source = item.place;
    } else towns.set(key, { days: new Set([item.day_id]), source: item.place });
  }
  const best = [...towns.values()].sort((a, b) => b.days.size - a.days.size)[0];
  if (!best?.source) {
    const countries = new Map<
      string,
      { days: Set<string>; source: NonNullable<TripCoverCandidate["place"]> }
    >();
    const names = [
      new Intl.DisplayNames(["en"], { type: "region" }),
      new Intl.DisplayNames(["zh-CN"], { type: "region" }),
    ];
    for (const item of candidates) {
      const code = item.place?.country_code?.toUpperCase();
      if (
        item.type !== "location" ||
        !item.day_id ||
        !item.place ||
        !code ||
        !/^[A-Z]{2}$/.test(code)
      )
        continue;
      const label = item.place.display_name.trim().toLocaleLowerCase();
      if (
        ![code, ...names.map((formatter) => formatter.of(code))].some(
          (value) => value?.toLocaleLowerCase() === label,
        )
      )
        continue;
      const existing = countries.get(code);
      if (existing) existing.days.add(item.day_id);
      else countries.set(code, { days: new Set([item.day_id]), source: item.place });
    }
    const country = [...countries.values()].sort((a, b) => b.days.size - a.days.size)[0];
    if (!country) return undefined;
    return {
      name: country.source.display_name,
      placeId: country.source.id,
      dayCount: country.days.size,
      ...(country.source.source === "google" && country.source.google_place_id
        ? { googlePlaceId: country.source.google_place_id }
        : {}),
    };
  }
  return {
    name: best.source.locality_name!.trim(),
    placeId: best.source.id,
    ...(best.source.source === "google" && best.source.google_place_id
      ? { googlePlaceId: best.source.google_place_id }
      : {}),
    dayCount: best.days.size,
  };
}
