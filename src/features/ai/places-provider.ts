import { handleGooglePlacesRequest } from "@/lib/providers/google/places/google-places-api";
import { handleAmapPlacesRequest } from "@/lib/providers/amap/places/amap-places-api";
import { placeSnapshotFromJson, type PlaceSnapshot } from "@/lib/providers/places/types";
import type { PlaceSuggestion } from "@/lib/providers/places/contracts";
import { AiError } from "./service";

export type LookupProvider = {
  id: "google" | "amap";
  search(query: string, session: string): Promise<PlaceSuggestion[]>;
  resolve(id: string, session: string): Promise<PlaceSnapshot>;
};

/** Reuse the web provider's normalization, field masks, bounds and retry policy. */
export function createLookupProvider(
  id: "google" | "amap",
  apiKey: string,
  fetchImplementation?: typeof fetch,
): LookupProvider {
  async function request(operation: "suggest" | "resolve", value: string, session: string) {
    const url = new URL("https://internal.invalid/places");
    url.searchParams.set("operation", operation);
    url.searchParams.set(operation === "suggest" ? "input" : "id", value);
    if (id === "google") url.searchParams.set("session", session);
    const response = await (id === "google" ? handleGooglePlacesRequest : handleAmapPlacesRequest)(
      new Request(url, { signal: AbortSignal.timeout(30_000) }),
      { apiKey, fetchImplementation },
    );
    if (!response.ok) throw new AiError("PLACE_PROVIDER_UNAVAILABLE");
    return (await response.json()) as Record<string, unknown>;
  }
  return {
    id,
    async search(query, session) {
      const result = await request("suggest", query, session);
      return Array.isArray(result.suggestions) ? (result.suggestions as PlaceSuggestion[]) : [];
    },
    async resolve(placeId, session) {
      const result = await request("resolve", placeId, session);
      const place = placeSnapshotFromJson(result.place);
      if (!place || place.provider !== id || place.providerPlaceId !== placeId)
        throw new AiError("PLACE_PROVIDER_UNAVAILABLE");
      return place;
    },
  };
}
