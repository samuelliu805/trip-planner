import { z } from "zod";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";
import { getCurrentTripCoverSource } from "@/features/trips/cover-data";
import { tripIdSchema } from "@/features/trips/schema";
import {
  publicPlacePhotosConfigured,
  resolvePublicPlaceMedia,
  verifyPublicPhotoSignature,
  fetchPublicPhotoMedia,
} from "@/lib/providers/places/public-photo.server";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const photoRequest = z.object({
  photo: z.string().regex(/^places\/[^/]+\/photos\/[^/]+$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
const rateBuckets = new Map<string, { count: number; expiresAt: number }>();
function consumeResolution(userId: string) {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (bucket.expiresAt <= now) rateBuckets.delete(key);
  const bucket = rateBuckets.get(userId);
  if (bucket && bucket.count >= 30) return false;
  rateBuckets.set(userId, {
    count: (bucket?.count ?? 0) + 1,
    expiresAt: bucket?.expiresAt ?? now + 60_000,
  });
  return true;
}

export async function GET(request: Request, context: { params: Promise<{ tripId: string }> }) {
  if (request.headers.get("sec-fetch-site") !== "same-origin")
    return new Response(null, { status: 403, headers });
  const parsedId = tripIdSchema.safeParse((await context.params).tripId);
  if (!parsedId.success || !publicPlacePhotosConfigured())
    return new Response(null, { status: 404, headers });
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return new Response(null, { status: 401, headers });
  const tripId = parsedId.data;
  if (!(await getTripRepository().getById(tripId)))
    return new Response(null, { status: 404, headers });
  const cover = await getCurrentTripCoverSource(tripId);
  if (!cover?.googlePlaceId) return new Response(null, { status: 404, headers });
  const source = {
    itemRef: cover.placeId,
    provider: "google" as const,
    providerPlaceId: cover.googlePlaceId,
  };
  const search = new URL(request.url).searchParams;
  if (search.get("resolve") === "1") {
    if (!consumeResolution(user.id)) return new Response(null, { status: 429, headers });
    const resolved = await resolvePublicPlaceMedia(
      tripId,
      [source],
      [{ ref: source.itemRef, title: cover.name, sortOrder: 0, type: "location" }],
    );
    const media = resolved.get(source.itemRef)?.[0];
    if (!media) return new Response(null, { status: 404, headers });
    const query = new URL(media.url, request.url).searchParams;
    return Response.json(
      { ...media, url: `/api/trips/${tripId}/cover-photo?${query}` },
      { headers },
    );
  }
  const query = photoRequest.safeParse({
    photo: search.get("photo"),
    signature: search.get("signature"),
  });
  if (
    !query.success ||
    !verifyPublicPhotoSignature(source, tripId, query.data.photo, query.data.signature)
  )
    return new Response(null, { status: 404, headers });
  const photo = await fetchPublicPhotoMedia(source, query.data.photo);
  if (!photo?.ok || !photo.body || !photo.headers.get("content-type")?.startsWith("image/")) {
    const status =
      photo && [400, 404, 410].includes(photo.status) ? 410 : photo?.status === 429 ? 429 : 503;
    return new Response(null, { status, headers });
  }
  return new Response(photo.body, {
    headers: { ...headers, "Content-Type": photo.headers.get("content-type")! },
  });
}
