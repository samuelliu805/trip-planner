import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  publicItineraryLinkSchema,
  publicItinerarySchema,
  unavailablePublicItinerarySchema,
} from "./schema";
import { resolveGooglePlaceMedia } from "./google-place-photo.server";
import { publicPlaceMediaSources } from "./public-media-data";
import type { PublicItinerary, PublicItineraryLink } from "./types";

export async function getPublicItinerary(token: string): Promise<PublicItinerary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_itinerary_v4", { shared_token: token });
  if (error) return null;
  if (unavailablePublicItinerarySchema.safeParse(data).success) return null;
  const parsed = publicItinerarySchema.safeParse(data);
  if (!parsed.success) return null;

  const items = parsed.data.days.flatMap(({ items: dayItems }) => dayItems);
  const sources = publicPlaceMediaSources(parsed.data);
  const mediaByItem = await resolveGooglePlaceMedia(token, sources, items);
  if (!mediaByItem.size) return parsed.data;
  const withMedia = {
    ...parsed.data,
    days: parsed.data.days.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        const media = mediaByItem.get(item.ref);
        return media?.length ? { ...item, media } : item;
      }),
    })),
  };
  const enriched = publicItinerarySchema.safeParse(withMedia);
  return enriched.success ? enriched.data : parsed.data;
}

export async function listPublicItineraryLinks(
  tripId: string,
): Promise<{ data: PublicItineraryLink[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_itinerary_links_v3", {
    target_trip_id: tripId,
  });
  if (error) return { data: [], error: error.message };
  const parsed = publicItineraryLinkSchema.array().safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : { data: [], error: "Public link settings could not be read." };
}
