"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { createContext, useContext, useState } from "react";

type MapConfiguration = { apiError?: string; apiKey?: string; mapId?: string };
const MapConfigurationContext = createContext<MapConfiguration>({});

export function useMapConfiguration() {
  return useContext(MapConfigurationContext);
}

export function PlannerMapProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const [apiError, setApiError] = useState<string>();
  const value = { apiError, apiKey, mapId };

  if (!apiKey || !mapId)
    return (
      <MapConfigurationContext.Provider value={value}>{children}</MapConfigurationContext.Provider>
    );

  return (
    <MapConfigurationContext.Provider value={value}>
      <APIProvider
        apiKey={apiKey}
        authReferrerPolicy="origin"
        libraries={["places"]}
        onError={(error) =>
          setApiError(error instanceof Error ? error.message : "Google Maps could not be loaded.")
        }
      >
        {children}
      </APIProvider>
    </MapConfigurationContext.Provider>
  );
}
