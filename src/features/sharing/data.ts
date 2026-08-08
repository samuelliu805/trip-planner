import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  publicItineraryLinkSchema,
  publicItinerarySchema,
  unavailablePublicItinerarySchema,
} from "./schema";
import type { PublicItinerary, PublicItineraryLink } from "./types";

export async function getPublicItinerary(token: string): Promise<PublicItinerary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_itinerary_v2", { shared_token: token });
  if (error) return null;
  if (unavailablePublicItinerarySchema.safeParse(data).success) return null;
  const parsed = publicItinerarySchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function listPublicItineraryLinks(
  tripId: string,
): Promise<{ data: PublicItineraryLink[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_itinerary_links", {
    target_trip_id: tripId,
  });
  if (error) return { data: [], error: error.message };
  const parsed = publicItineraryLinkSchema.array().safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : { data: [], error: "Public link settings could not be read." };
}
