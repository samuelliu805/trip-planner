import "server-only";

import type { RouteProvider } from "@/lib/providers/routes/types";

import { createAmapRoutesProvider } from "./amap-routes-core";

export function amapRoutesProviderFromEnvironment(): RouteProvider {
  return createAmapRoutesProvider({ apiKey: process.env.AMAP_WEB_SERVICE_KEY ?? "" });
}
