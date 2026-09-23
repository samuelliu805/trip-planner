import "server-only";

import { NextResponse } from "next/server";

import { tripIdSchema } from "@/features/trips/schema";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";

import { handleGooglePlacesRequest } from "./google-places-api";

const rateWindowMs = 60_000;
const requestsPerWindow = 90;
const rateBuckets = new Map<string, { count: number; expiresAt: number }>();

function consumeRateLimit(key: string) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.expiresAt <= now) {
    rateBuckets.set(key, { count: 1, expiresAt: now + rateWindowMs });
    return true;
  }
  if (current.count >= requestsPerWindow) return false;
  current.count += 1;
  if (rateBuckets.size > 1_000) {
    for (const [candidate, bucket] of rateBuckets) {
      if (bucket.expiresAt <= now) rateBuckets.delete(candidate);
    }
  }
  return true;
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { headers: { "Cache-Control": "private, no-store, max-age=0" }, status },
  );
}

export async function handleAuthorizedGooglePlacesRequest(request: Request, rawTripId: string) {
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return jsonError("Same-origin request required.", 403);
  }
  const tripId = tripIdSchema.safeParse(rawTripId);
  if (!tripId.success) return jsonError("Trip not found.", 404);
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return jsonError("Authentication required.", 401);
  const trip = await getTripRepository().getById(tripId.data);
  if (!trip) return jsonError("Trip not found.", 404);
  if (!consumeRateLimit(`${user.id}:${trip.id}`)) {
    return jsonError("Places search is temporarily rate limited.", 429);
  }
  return handleGooglePlacesRequest(request, {
    apiKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
  });
}
