"use client";

import { AmapMapsProvider } from "@/lib/providers/amap/maps/amap-maps-provider";

import { MapProviderContext } from "./client-context";

export function PlannerMapProvider({ children }: { children: React.ReactNode }) {
  return (
    <MapProviderContext.Provider value={{ providerId: "amap" }}>
      <AmapMapsProvider>{children}</AmapMapsProvider>
    </MapProviderContext.Provider>
  );
}
