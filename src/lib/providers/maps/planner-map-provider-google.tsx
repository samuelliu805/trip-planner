"use client";

import { GoogleMapsProvider } from "@/lib/providers/google/maps/google-maps-provider";

import { MapProviderContext } from "./client-context";

export function PlannerMapProvider({ children }: { children: React.ReactNode }) {
  return (
    <MapProviderContext.Provider value={{ providerId: "google" }}>
      <GoogleMapsProvider>{children}</GoogleMapsProvider>
    </MapProviderContext.Provider>
  );
}
