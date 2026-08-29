import { coordinatesFromJson, type Coordinates } from "../maps/types.ts";
import type { MapsProviderId } from "../maps/provider.ts";

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
export type PlaceProviderId = MapsProviderId | "custom";

export type PlaceSnapshot = Coordinates & {
  provider: PlaceProviderId;
  providerPlaceId?: string;
  displayName: string;
  formattedAddress?: string;
  localityName?: string;
  localityKind?: LocalityKind;
  countryCode?: string;
  administrativeAreaName?: string;
  localitySource?: LocalitySource;
};

export function placeSnapshotFromJson(value: unknown): PlaceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<PlaceSnapshot>;
  const coordinates = coordinatesFromJson(candidate);
  if (
    !["google", "amap", "custom"].includes(candidate.provider ?? "") ||
    typeof candidate.displayName !== "string" ||
    !candidate.displayName.trim() ||
    !coordinates ||
    (candidate.provider !== "custom" &&
      (typeof candidate.providerPlaceId !== "string" || !candidate.providerPlaceId.trim()))
  )
    return null;
  return { ...candidate, ...coordinates } as PlaceSnapshot;
}
