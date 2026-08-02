import "server-only";

import { createGoogleRoutesProvider } from "./google-routes-core";
import type { RouteLegRequest } from "./types";

export async function calculateGoogleRouteLeg(request: RouteLegRequest) {
  return createGoogleRoutesProvider({
    apiKey: process.env.GOOGLE_ROUTES_API_KEY ?? "",
  }).calculateLeg(request);
}
