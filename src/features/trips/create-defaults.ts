import type { PlaceSnapshot } from "@/lib/providers/places/types";

export const defaultTripCurrency = "USD";
export const defaultTripDayCount = 1;
/** Longer than this and a place-derived name stops fitting the app bar next to its controls. */
const placeTitleLimit = 32;
const datedTitlePattern = /^New trip \d{4}-\d{2}-\d{2}$/;

/** `yyyy-mm-dd` where the traveller is, so a trip started at 11pm is never named tomorrow. */
export function tripDateInZone(timezone: string, now: Date) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function defaultTripTitle(date: string) {
  return `New trip ${date}`;
}

/** True while the trip still wears the name creation gave it, so a place may replace it. */
export function isDefaultTripTitle(title: string) {
  return datedTitlePattern.test(title.trim());
}

/**
 * The shortest honest name for a place: the city it sits in, or else the place itself. An overlong
 * name is cut at a word boundary instead of mid-word.
 */
export function tripTitleFromPlace(place: Pick<PlaceSnapshot, "displayName" | "localityName">) {
  const name = ((place.localityName ?? "").trim() || place.displayName.trim()).replace(/\s+/g, " ");
  if (name.length <= placeTitleLimit) return name;
  const cut = name.slice(0, placeTitleLimit);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > placeTitleLimit / 2 ? cut.slice(0, boundary) : cut).trim();
}
