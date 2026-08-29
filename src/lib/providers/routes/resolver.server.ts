import "server-only";

import { googleRoutesProviderFromEnvironment } from "@/lib/providers/google/routes/google-routes.server";
import { resolveMapsProvider } from "@/lib/providers/maps/provider";

import type { RouteLegRequest, RouteProvider } from "./types";

export function resolveRouteProvider(): RouteProvider {
  const providerId = resolveMapsProvider("routes");
  if (providerId === "google") return googleRoutesProviderFromEnvironment();
  // resolveMapsProvider fails closed for every unavailable provider.
  throw new Error("The configured route provider is unavailable.");
}

export async function calculateRouteLeg(request: RouteLegRequest) {
  return resolveRouteProvider().calculateLeg(request);
}
