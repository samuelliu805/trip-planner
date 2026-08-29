import type { PlaceSnapshot } from "./types.ts";

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
