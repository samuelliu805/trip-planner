import "server-only";

import type { PublicPlaceMediaSource } from "@/features/sharing/public-media-data";
import type { PublicItineraryItem } from "@/features/sharing/types";
import {
  fetchGooglePhotoMedia,
  resolveGooglePlaceMedia,
  verifyGooglePhotoSignature,
} from "@/lib/providers/google/sharing/google-place-photo.server";
import { configuredMapsProviderId } from "@/lib/providers/maps/provider";

import { publicPhotoProviderEnabled } from "./photo-gating";

export async function resolvePublicPlaceMedia(
  token: string,
  sources: PublicPlaceMediaSource[],
  items: PublicItineraryItem[],
) {
  if (!sources.length) return new Map();
  const providerId = configuredMapsProviderId();
  if (!publicPhotoProviderEnabled(providerId, "google")) return new Map();
  return resolveGooglePlaceMedia(
    token,
    sources.filter(({ provider }) => provider === "google"),
    items,
  );
}

export function verifyPublicPhotoSignature(
  source: PublicPlaceMediaSource,
  token: string,
  photoName: string,
  signature: string,
) {
  const providerId = configuredMapsProviderId();
  if (!publicPhotoProviderEnabled(providerId, source.provider)) return false;
  return verifyGooglePhotoSignature(
    token,
    source.itemRef,
    source.providerPlaceId,
    photoName,
    signature,
  );
}

export async function fetchPublicPhotoMedia(source: PublicPlaceMediaSource, photoName: string) {
  const providerId = configuredMapsProviderId();
  if (!publicPhotoProviderEnabled(providerId, source.provider)) return null;
  return fetchGooglePhotoMedia(photoName, source.providerPlaceId);
}
