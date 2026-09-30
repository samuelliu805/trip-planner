import "server-only";

import {
  getBackendCapabilities,
  getPublicRelationalDatabase,
  getRelationalDatabase,
} from "@/platform/composition/server";
import { PlatformOperationError } from "@/platform/contracts/errors";
import { retryTransientRead } from "@/platform/transient-read";

import { publicPlaceMediaSources } from "./public-media-data";
import { publicPlacePhotosConfigured } from "@/lib/providers/places/public-photo.server";

import { ownerShareImageStateSchema, shareImageManifestSchema } from "./long-image/schema";
import {
  publicItineraryLinkSchema,
  publicItinerarySchema,
  unavailablePublicItinerarySchema,
} from "./schema";
import type {
  OwnerShareImageState,
  PublicItinerary,
  PublicItineraryLink,
  ShareImageManifest,
} from "./types";

export async function getPublicItinerary(token: string): Promise<PublicItinerary | null> {
  if (!getBackendCapabilities().signedUrls) return null;
  const database = await getPublicRelationalDatabase();
  const { data, error } = await retryTransientRead(async () =>
    database.rpc("get_public_share_page_v3", { shared_token: token }),
  );
  if (error) return null;
  if (unavailablePublicItinerarySchema.safeParse(data).success) return null;
  const parsed = publicItinerarySchema.safeParse(data);
  if (!parsed.success) return null;

  const sourceRefs = new Set(
    publicPlacePhotosConfigured()
      ? publicPlaceMediaSources(parsed.data).map(({ itemRef }) => itemRef)
      : [],
  );
  return {
    ...parsed.data,
    days: parsed.data.days.map((day) => ({
      ...day,
      items: day.items.map((item) =>
        sourceRefs.has(item.ref)
          ? {
              ...item,
              media: [
                ...(item.media ?? []).filter(({ source }) => source !== "google_place"),
                {
                  id: `google-place:${item.ref}`,
                  kind: "image" as const,
                  source: "google_place" as const,
                  url: `/api/public-place-photo/${token}/${item.ref}?resolve=1`,
                },
              ],
            }
          : item,
      ),
    })),
  };
}

export async function listPublicItineraryLinks(
  tripId: string,
): Promise<{ data: PublicItineraryLink[]; error: string | null }> {
  if (!getBackendCapabilities().signedUrls)
    return { data: [], error: "Public sharing is not supported by this backend." };
  const database = await getRelationalDatabase();
  const { data, error } = await retryTransientRead(async () =>
    database.rpc("list_share_pages_v2", { target_trip_id: tripId }),
  );
  if (error) return { data: [], error: error.message };
  const parsed = publicItineraryLinkSchema.array().safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : { data: [], error: "Public link settings could not be read." };
}

export async function getPublicShareImage(token: string): Promise<ShareImageManifest | null> {
  if (!getBackendCapabilities().signedUrls) return null;
  const database = await getPublicRelationalDatabase();
  const { data, error } = await retryTransientRead(async () =>
    database.rpc("public_share_page_image_v1", { shared_token: token }),
  );
  if (error) return null;
  const parsed = shareImageManifestSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function getShareImageManifest(
  permanentSlug: string,
): Promise<ShareImageManifest | null> {
  if (!getBackendCapabilities().signedUrls) return null;
  const database = await getPublicRelationalDatabase();
  const { data, error } = await retryTransientRead(async () =>
    database.rpc("public_share_image_manifest_v1", { requested_slug: permanentSlug }),
  );
  if (error) return null;
  const parsed = shareImageManifestSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function getOwnerShareImageState(
  sharePageId: string,
): Promise<OwnerShareImageState | null> {
  if (!getBackendCapabilities().signedUrls) return null;
  const database = await getRelationalDatabase();
  const { data, error } = await retryTransientRead(async () =>
    database.rpc("owner_share_page_image_state_v1", { target_share_page_id: sharePageId }),
  );
  if (error) throw new Error(error.message);
  if (data === null) return null;
  const parsed = ownerShareImageStateSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function getOwnerSharePageByToken(token: string): Promise<PublicItineraryLink | null> {
  if (!getBackendCapabilities().signedUrls) return null;
  let database;
  try {
    database = await getRelationalDatabase();
  } catch (error) {
    if (error instanceof PlatformOperationError && error.code === "authentication_required") {
      return null;
    }
    throw error;
  }
  const { data, error } = await retryTransientRead(async () =>
    database.rpc("owner_share_page_by_token_v2", { shared_token: token }),
  );
  if (error) throw new Error(error.message);
  if (data === null) return null;
  const parsed = publicItineraryLinkSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
