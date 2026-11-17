import type { Json } from "@/types/database";
import type { LookupProvider } from "./places-provider";
import { placeMapUrl } from "./places-links";
import type { PlaceLookupLimits } from "./place-schemas";
import { AiError, callRpc, type Rpc, type PlacesToolRunner } from "./service";

type StartedLookup = { id: string; session_id: string; expires_at: string };

export function createPlacesToolRunner(
  rpc: Rpc,
  provider: LookupProvider,
  limits: PlaceLookupLimits,
): PlacesToolRunner {
  return async (tool, input, authorization) => {
    // The existing gateway rechecks live credentials and places:read before any
    // billable provider request. Only IDs and short-lived coordinates are stored.
    const started = (await callRpc(rpc, "ai_invoke_v1", {
      access_hash: authorization.hash,
      expected_resource: authorization.resource,
      expected_issuer: authorization.issuer,
      tool,
      args: { ...input, _provider: provider.id, _limits: limits },
    })) as StartedLookup;
    if (!started?.id || !started.session_id) throw new AiError("SERVICE_UNAVAILABLE");
    const finish = (result: Record<string, unknown>) =>
      callRpc(rpc, "ai_place_finish_v1", {
        access_hash: authorization.hash,
        expected_resource: authorization.resource,
        expected_issuer: authorization.issuer,
        lookup_id: started.id,
        result,
      });
    const attribution = {
      label: provider.id === "google" ? "Google Maps" : "AMap",
      url: provider.id === "google" ? "https://maps.google.com" : "https://www.amap.com",
    };
    try {
      if (tool === "place_search") {
        const candidates = (await provider.search(String(input.query), started.session_id)).slice(
          0,
          Number(input.limit),
        );
        await finish({ candidate_ids: candidates.map(({ id }) => id) });
        return {
          search_id: started.id,
          provider: provider.id,
          expires_at: started.expires_at,
          candidates: candidates.map(({ id, primary, secondary }) => ({
            provider_place_id: id,
            name: primary,
            ...(secondary && { context: secondary }),
            maps_url: placeMapUrl(provider.id, id),
          })),
          attribution,
          next_step: "Choose a candidate and call place_resolve. Do not guess when ambiguous.",
        } as Json;
      }
      const place = await provider.resolve(String(input.provider_place_id), started.session_id);
      const selected = await finish({
        provider_place_id: place.providerPlaceId,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      return {
        ...(selected as Record<string, Json>),
        place: place as unknown as Json,
        stable_place_id: `${provider.id}:${place.providerPlaceId}`,
        maps_url: placeMapUrl(provider.id, place.providerPlaceId!),
        attribution,
        next_step:
          "Pass location: { selection_id } to an Idea or itinerary write. Keep your own title and notes.",
      };
    } catch (error) {
      // A failed/denied provider response must never become a usable selection.
      await finish({ failed: true }).catch(() => undefined);
      throw error instanceof AiError ? error : new AiError("PLACE_PROVIDER_UNAVAILABLE");
    }
  };
}
