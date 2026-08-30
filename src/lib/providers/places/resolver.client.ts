"use client";

import { useGooglePlacesProvider } from "@/lib/providers/google/places/use-google-places-provider";
import { MapsProviderConfigurationError, resolveMapsProvider } from "@/lib/providers/maps/provider";

import type { PlacesProviderState } from "./contracts";

export function usePlacesProvider(): PlacesProviderState {
  const googleProvider = useGooglePlacesProvider();
  try {
    const providerId = resolveMapsProvider("places");
    return { provider: providerId === "google" ? googleProvider : null };
  } catch (error) {
    return {
      error:
        error instanceof MapsProviderConfigurationError
          ? error
          : new MapsProviderConfigurationError({
              capability: "places",
              code: "invalid_provider",
            }),
      provider: null,
    };
  }
}
