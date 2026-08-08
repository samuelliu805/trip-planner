import { hasValidCoordinates } from "../maps/types.ts";
import type { LocalityKind, PlaceSnapshot } from "./types.ts";

export type GoogleAddressComponent = {
  longText?: string | null;
  shortText?: string | null;
  types?: string[] | null;
};

export type GooglePlaceValue = {
  addressComponents?: GoogleAddressComponent[] | null;
  id?: string | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat(): number; lng(): number } | { lat: number; lng: number } | null;
};

const administrativeLevelTwoCountries = new Set(["CN", "HK", "JP", "KR", "MO", "SG", "TW"]);

function componentOfType(components: GoogleAddressComponent[], type: string) {
  return components.find((component) => component.types?.includes(type));
}

function componentText(component?: GoogleAddressComponent) {
  return component?.longText?.trim() || component?.shortText?.trim() || undefined;
}

export function resolveGooglePlaceLocality(
  components: GoogleAddressComponent[] = [],
): Partial<
  Pick<
    PlaceSnapshot,
    "administrativeAreaName" | "countryCode" | "localityKind" | "localityName" | "localitySource"
  >
> {
  const country = componentOfType(components, "country");
  const countryCode = country?.shortText?.trim().toUpperCase();
  const administrativeAreaName = componentText(
    componentOfType(components, "administrative_area_level_1"),
  );
  const priority: LocalityKind[] = [
    "locality",
    "postal_town",
    "administrative_area_level_3",
    ...(countryCode && administrativeLevelTwoCountries.has(countryCode)
      ? (["administrative_area_level_2"] as const)
      : []),
    "sublocality_level_1",
    "sublocality",
  ];
  for (const localityKind of priority) {
    const localityName = componentText(componentOfType(components, localityKind));
    if (localityName)
      return {
        localityName,
        localityKind,
        ...(countryCode && /^[A-Z]{2}$/.test(countryCode) && { countryCode }),
        ...(administrativeAreaName && { administrativeAreaName }),
        localitySource: "google_address_component" as const,
      };
  }
  return {
    ...(countryCode && /^[A-Z]{2}$/.test(countryCode) && { countryCode }),
    ...(administrativeAreaName && { administrativeAreaName }),
  };
}

function coordinate(value: number | (() => number) | undefined) {
  return typeof value === "function" ? value() : value;
}

export function normalizeGooglePlace(value: GooglePlaceValue): PlaceSnapshot {
  const latitude = coordinate(value.location?.lat);
  const longitude = coordinate(value.location?.lng);
  const displayName = value.displayName?.trim();
  const providerPlaceId = value.id?.trim();
  if (!providerPlaceId || !displayName || latitude === undefined || longitude === undefined)
    throw new Error("The selected place is missing required map details.");
  if (!hasValidCoordinates({ latitude, longitude }))
    throw new Error("The selected place has invalid coordinates.");
  return {
    displayName,
    ...(value.formattedAddress?.trim() && { formattedAddress: value.formattedAddress.trim() }),
    latitude,
    longitude,
    provider: "google",
    providerPlaceId,
    ...resolveGooglePlaceLocality(value.addressComponents ?? []),
  };
}

export function deduplicatePlaceSnapshots(snapshots: PlaceSnapshot[]): PlaceSnapshot[] {
  const seen = new Set<string>();
  return snapshots.filter((snapshot) => {
    const key = snapshot.providerPlaceId
      ? `${snapshot.provider}:${snapshot.providerPlaceId}`
      : `${snapshot.provider}:${snapshot.latitude}:${snapshot.longitude}:${snapshot.displayName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
