import "server-only";

import { handleAmapPlacesRequest } from "./amap-places-api";

export function handleAmapPlacesRequestFromEnvironment(request: Request) {
  return handleAmapPlacesRequest(request, {
    apiKey: process.env.AMAP_WEB_SERVICE_KEY ?? "",
  });
}
