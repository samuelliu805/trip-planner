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
  const towns = new Map<
    string,
    { days: Set<string>; source: TripCoverCandidate["place"]; name: string }
  >();
  const ordered = candidates.slice().sort((a, b) => a.sort_order - b.sort_order);
  const days = new Set(ordered.flatMap((item) => (item.day_id ? [item.day_id] : [])));
  for (const day of days) {
    const stops = ordered.filter(
      (item) =>
        item.day_id === day &&
        item.place?.locality_name?.trim() &&
        ["location", "hotel", "activity", "meal"].includes(item.type),
    );
    const stop =
      stops.findLast((item) => item.type === "hotel") ??
      stops.find((item) => item.type === "location") ??
      stops[0];
    if (!stop?.place?.locality_name) continue;
    const name = stop.place.locality_name.trim();
    const key = `${stop.place.country_code ?? ""}:${name.toLocaleLowerCase()}`;
    // Resolve only an actual saved town, including one saved on another day.
    const source =
      ordered.find(
        (item) =>
          ["location", "hotel"].includes(item.type) &&
          item.place?.country_code === stop.place?.country_code &&
          item.place?.locality_name?.trim().toLocaleLowerCase() === name.toLocaleLowerCase() &&
          item.place.display_name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      )?.place ?? null;
    const existing = towns.get(key);
    if (existing) existing.days.add(day);
    else towns.set(key, { days: new Set([day]), source, name });
  }
  const best = [...towns.values()].sort((a, b) => b.days.size - a.days.size)[0];
  if (best && !best.source) return undefined;
  if (!best) {
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
  if (!best.source) return undefined;
  return {
    name: best.name,
    placeId: best.source.id,
    ...(best.source.source === "google" && best.source.google_place_id
      ? { googlePlaceId: best.source.google_place_id }
      : {}),
    dayCount: best.days.size,
  };
}
