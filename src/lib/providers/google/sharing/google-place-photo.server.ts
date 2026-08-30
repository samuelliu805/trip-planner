import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { mapWithConcurrency } from "@/features/routes/calculator";
import type { PublicPlaceMediaSource } from "@/features/sharing/public-media-data";
import type { PublicItemMedia, PublicItineraryItem } from "@/features/sharing/types";

const googleAuthorSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    uri: z.url().optional(),
  })
  .passthrough();
const googlePhotoSchema = z
  .object({
    authorAttributions: z.array(googleAuthorSchema).optional(),
    name: z.string().regex(/^places\/[^/]+\/photos\/[^/]+$/),
  })
  .passthrough();
const googlePlacePhotoResponseSchema = z
  .object({ photos: z.array(googlePhotoSchema).optional() })
  .passthrough();

const MAX_GOOGLE_PHOTO_LOOKUPS = 40;

function apiKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim();
}

export function googlePlacePhotosConfigured() {
  return Boolean(apiKey());
}

function signaturePayload(
  token: string,
  itemRef: string,
  providerPlaceId: string,
  photoName: string,
) {
  return `${token}:${itemRef}:${providerPlaceId}:${photoName}`;
}

function signPhoto(token: string, itemRef: string, providerPlaceId: string, photoName: string) {
  const key = apiKey();
  if (!key) return null;
  return createHmac("sha256", key)
    .update(signaturePayload(token, itemRef, providerPlaceId, photoName))
    .digest("hex");
}

export function verifyGooglePhotoSignature(
  token: string,
  itemRef: string,
  providerPlaceId: string,
  photoName: string,
  signature: string,
) {
  const expected = signPhoto(token, itemRef, providerPlaceId, photoName);
  if (!expected || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

async function fetchGooglePlacePhoto(providerPlaceId: string) {
  const key = apiKey();
  if (!key) return null;
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(providerPlaceId)}`,
      {
        cache: "no-store",
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "photos",
        },
      },
    );
    if (!response.ok) return null;
    const parsed = googlePlacePhotoResponseSchema.safeParse(await response.json());
    return parsed.success ? (parsed.data.photos?.[0] ?? null) : null;
  } catch {
    return null;
  }
}

function googleMapsPlaceUrl(providerPlaceId: string, title: string) {
  const search = new URLSearchParams({
    api: "1",
    query: title,
    query_place_id: providerPlaceId,
  });
  return `https://www.google.com/maps/search/?${search.toString()}`;
}

function googlePhotoMediaUrl(
  token: string,
  itemRef: string,
  providerPlaceId: string,
  photoName: string,
) {
  const signature = signPhoto(token, itemRef, providerPlaceId, photoName);
  if (!signature) return null;
  const search = new URLSearchParams({ photo: photoName, signature });
  return `/api/public-place-photo/${token}/${itemRef}?${search.toString()}`;
}

export async function resolveGooglePlaceMedia(
  token: string,
  sources: PublicPlaceMediaSource[],
  items: PublicItineraryItem[],
) {
  if (!apiKey() || !sources.length) return new Map<string, PublicItemMedia[]>();
  const itemByRef = new Map(items.map((item) => [item.ref, item]));
  const eligible = sources.filter(({ itemRef }) => itemByRef.has(itemRef));
  const uniqueProviderIds = [
    ...new Set(eligible.map(({ providerPlaceId }) => providerPlaceId)),
  ].slice(0, MAX_GOOGLE_PHOTO_LOOKUPS);
  const photos = new Map(
    await mapWithConcurrency(
      uniqueProviderIds.map(
        (providerPlaceId) => async () =>
          [providerPlaceId, await fetchGooglePlacePhoto(providerPlaceId)] as const,
      ),
      4,
    ),
  );
  const canonicalSource = new Map<string, PublicPlaceMediaSource>();
  for (const source of eligible)
    if (!canonicalSource.has(source.providerPlaceId))
      canonicalSource.set(source.providerPlaceId, source);
  const resolved = new Map<string, PublicItemMedia[]>();
  for (const { itemRef, providerPlaceId } of eligible) {
    const item = itemByRef.get(itemRef);
    const photo = photos.get(providerPlaceId);
    if (!item || !photo) continue;
    const requestItemRef = canonicalSource.get(providerPlaceId)?.itemRef;
    if (!requestItemRef) continue;
    const url = googlePhotoMediaUrl(token, requestItemRef, providerPlaceId, photo.name);
    if (!url) continue;
    const author = photo.authorAttributions?.[0];
    resolved.set(itemRef, [
      {
        alt: `${item.title} place photo`,
        ...(author && {
          attribution: { label: author.displayName, ...(author.uri && { url: author.uri }) },
        }),
        id: `google-place:${itemRef}`,
        kind: "image",
        source: "google_place",
        sourceUrl: googleMapsPlaceUrl(providerPlaceId, item.title),
        url,
      },
    ]);
  }
  return resolved;
}

export async function fetchGooglePhotoMedia(photoName: string, providerPlaceId: string) {
  const key = apiKey();
  if (!key || !photoName.startsWith(`places/${providerPlaceId}/photos/`)) return null;
  try {
    const search = new URLSearchParams({ key, maxWidthPx: "1200" });
    const response = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?${search.toString()}`,
      { cache: "no-store", redirect: "follow" },
    );
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.startsWith("image/")
    )
      return null;
    return response;
  } catch {
    return null;
  }
}
