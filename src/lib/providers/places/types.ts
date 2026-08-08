import type { Coordinates } from "@/lib/providers/maps/types";

export const localityKinds = [
  "locality",
  "postal_town",
  "administrative_area_level_3",
  "administrative_area_level_2",
  "sublocality_level_1",
  "sublocality",
  "legacy_city",
] as const;

export type LocalityKind = (typeof localityKinds)[number];
export type LocalitySource = "google_address_component" | "legacy_city";

export type PlaceSnapshot = Coordinates & {
  provider: "google" | "custom";
  providerPlaceId?: string;
  displayName: string;
  formattedAddress?: string;
  localityName?: string;
  localityKind?: LocalityKind;
  countryCode?: string;
  administrativeAreaName?: string;
  localitySource?: LocalitySource;
};

export const placeFields = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "addressComponents",
] as const;
