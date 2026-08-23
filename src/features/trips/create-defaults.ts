export const defaultTripCurrency = "USD";
export const defaultTripDayCount = 1;
const placeTitleLimit = 32;
const placeTitleSuffix = " Trip";
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
export function tripTitleFromPlace(place: { displayName: string; localityName?: string | null }) {
  const name = ((place.localityName ?? "").trim() || place.displayName.trim()).replace(/\s+/g, " ");
  if (!name) return "";
  const baseLimit = placeTitleLimit - placeTitleSuffix.length;
  if (name.length <= baseLimit) return `${name}${placeTitleSuffix}`;
  const cut = name.slice(0, baseLimit);
  const boundary = cut.lastIndexOf(" ");
  const conciseName = (boundary > baseLimit / 2 ? cut.slice(0, boundary) : cut).trim();
  return `${conciseName}${placeTitleSuffix}`;
}
