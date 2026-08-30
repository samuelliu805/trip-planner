import "server-only";

import { createGoogleRoutesProvider } from "./google-routes-core";
import type { RouteProvider } from "@/lib/providers/routes/types";

export function googleRoutesProviderFromEnvironment(): RouteProvider {
  return createGoogleRoutesProvider({
    apiKey: process.env.GOOGLE_ROUTES_API_KEY ?? "",
  });
}
