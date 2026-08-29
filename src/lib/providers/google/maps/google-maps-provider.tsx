"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { createContext, useContext, useState } from "react";

import { useI18n } from "@/features/i18n/i18n-provider";

type GoogleMapConfiguration = { apiError?: string; apiKey?: string; mapId?: string };
const GoogleMapConfigurationContext = createContext<GoogleMapConfiguration>({});

export function useGoogleMapConfiguration() {
  return useContext(GoogleMapConfigurationContext);
}

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const [apiError, setApiError] = useState<string>();
  const value = { apiError, apiKey, mapId };

  if (!apiKey || !mapId)
    return (
      <GoogleMapConfigurationContext.Provider value={value}>
        {children}
      </GoogleMapConfigurationContext.Provider>
    );

  return (
    <GoogleMapConfigurationContext.Provider value={value}>
      <APIProvider
        apiKey={apiKey}
        authReferrerPolicy="origin"
        key={locale}
        language={locale}
        libraries={["places"]}
        onError={(error) =>
          setApiError(error instanceof Error ? error.message : "Google Maps could not be loaded.")
        }
      >
        {children}
      </APIProvider>
    </GoogleMapConfigurationContext.Provider>
  );
}
