import "server-only";

import { RouteProviderError } from "./errors";
import { createGoogleRoutesProvider } from "./google-routes-core";
import type { RouteLegRequest } from "./types";

export async function calculateGoogleRouteLeg(request: RouteLegRequest) {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) throw new RouteProviderError("missing_key");
  return createGoogleRoutesProvider({ apiKey }).calculateLeg(request);
}
