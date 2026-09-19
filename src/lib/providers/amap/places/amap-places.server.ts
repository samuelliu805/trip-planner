import "server-only";

import { createAmapPlacesCache, handleAmapPlacesRequest } from "./amap-places-api";

const placesCache = createAmapPlacesCache();

export function handleAmapPlacesRequestFromEnvironment(request: Request) {
  return handleAmapPlacesRequest(request, {
    apiKey: process.env.AMAP_WEB_SERVICE_KEY ?? "",
    cache: placesCache,
  });
}
