import type { MapsProviderId } from "../maps/provider.ts";

export function publicPhotoProviderEnabled(
  providerId: MapsProviderId,
  sourceProviderId: MapsProviderId,
) {
  return providerId === "google" && sourceProviderId === "google";
}
