import "server-only";

import { amapRoutesProviderFromEnvironment } from "@/lib/providers/amap/routes/amap-routes.server";
import { googleRoutesProviderFromEnvironment } from "@/lib/providers/google/routes/google-routes.server";
import { resolveMapsProvider } from "@/lib/providers/maps/provider";

import type { RouteLegRequest, RouteProvider } from "./types";

export function resolveRouteProvider(): RouteProvider {
  const providerId = resolveMapsProvider("routes");
  if (providerId === "google") return googleRoutesProviderFromEnvironment();
  if (providerId === "amap") return amapRoutesProviderFromEnvironment();
  throw new Error("The configured route provider is unavailable.");
}

export async function calculateRouteLeg(request: RouteLegRequest) {
  return resolveRouteProvider().calculateLeg(request);
}
