import "server-only";
import { getServerProviderConfig } from "@/platform/config/server";
import type { Rpc } from "./service";
import type { PlaceLookupLimits } from "./place-schemas";
import { createLookupProvider } from "./places-provider";
import { createPlacesToolRunner } from "./places-service";

export function configuredPlacesRunner(
  rpc: Rpc,
  config: { placesEnabled: boolean; placeLimits: PlaceLookupLimits },
) {
  if (!config.placesEnabled) return undefined;
  const provider = getServerProviderConfig().appRegion === "cn" ? "amap" : "google";
  const key =
    provider === "google" ? process.env.GOOGLE_PLACES_API_KEY : process.env.AMAP_WEB_SERVICE_KEY;
  return createPlacesToolRunner(rpc, createLookupProvider(provider, key ?? ""), config.placeLimits);
}
