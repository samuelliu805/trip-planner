"use client";

import { GoogleMapsProvider } from "@/lib/providers/google/maps/google-maps-provider";
import { AmapMapsProvider } from "@/lib/providers/amap/maps/amap-maps-provider";

import { MapProviderContext } from "./client-context";
import { MapsProviderConfigurationError, resolveMapsProvider } from "./provider";

function resolvedMapProvider() {
  try {
    return { providerId: resolveMapsProvider("maps") };
  } catch (error) {
    return {
      providerError:
        error instanceof MapsProviderConfigurationError
          ? error
          : new MapsProviderConfigurationError({
              capability: "maps",
              code: "invalid_provider",
            }),
    };
  }
}

export function PlannerMapProvider({ children }: { children: React.ReactNode }) {
  const configuration = resolvedMapProvider();
  if (configuration.providerId === "google")
    return (
      <MapProviderContext.Provider value={configuration}>
        <GoogleMapsProvider>{children}</GoogleMapsProvider>
      </MapProviderContext.Provider>
    );
  if (configuration.providerId === "amap")
    return (
      <MapProviderContext.Provider value={configuration}>
        <AmapMapsProvider>{children}</AmapMapsProvider>
      </MapProviderContext.Provider>
    );
  return (
    <MapProviderContext.Provider value={configuration}>{children}</MapProviderContext.Provider>
  );
}
