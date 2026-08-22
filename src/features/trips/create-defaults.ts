import type { PlaceSnapshot } from "@/lib/providers/places/types";

export const defaultTripCurrency = "USD";
export const defaultTripDayCount = 1;
const placeTitleLimit = 32;
const datedTitlePattern = /^New trip \d{4}-\d{2}-\d{2}$/;

/** Return yyyy-mm-dd in the traveller's timezone. */
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

export function isDefaultTripTitle(title: string) {
  return datedTitlePattern.test(title.trim());
}

/** Prefer a concise locality for the first place-derived trip name. */
export function tripTitleFromPlace(place: Pick<PlaceSnapshot, "displayName" | "localityName">) {
  const name = ((place.localityName ?? "").trim() || place.displayName.trim()).replace(/\s+/g, " ");
  if (name.length <= placeTitleLimit) return name;
  const cut = name.slice(0, placeTitleLimit);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > placeTitleLimit / 2 ? cut.slice(0, boundary) : cut).trim();
}
