import { hasValidCoordinates } from "../maps/types.ts";
import type { PlaceSnapshot } from "./types.ts";

export type GooglePlaceValue = {
  id?: string | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat(): number; lng(): number } | { lat: number; lng: number } | null;
};

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
