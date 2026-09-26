"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { createContext, useContext, useLayoutEffect, useState } from "react";

import { useI18n } from "@/features/i18n/i18n-provider";
import { useGooglePlacesProvider } from "@/lib/providers/google/places/use-google-places-provider";
import { PlacesProviderContext } from "@/lib/providers/places/client-context";

type GoogleMapConfiguration = { apiError?: string; apiKey?: string; mapId?: string };
const GoogleMapConfigurationContext = createContext<GoogleMapConfiguration>({});

export function useGoogleMapConfiguration() {
  return useContext(GoogleMapConfigurationContext);
}

function GooglePlacesProviderBridge({ children }: { children: React.ReactNode }) {
  const provider = useGooglePlacesProvider();
  return (
    <PlacesProviderContext.Provider value={{ provider, providerId: "google" }}>
      {children}
    </PlacesProviderContext.Provider>
  );
}

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const [apiError, setApiError] = useState<string>();
  const value = { apiError, apiKey, mapId };

  useLayoutEffect(() => {
    const mapsWindow = window as Window & { gm_authFailure?: () => void };
    const previousHandler = mapsWindow.gm_authFailure;
    const handleAuthFailure = () => {
      setApiError("Google Maps authentication failed. Check the browser key restrictions.");
      previousHandler?.();
    };
    mapsWindow.gm_authFailure = handleAuthFailure;
    return () => {
      if (mapsWindow.gm_authFailure === handleAuthFailure) {
        mapsWindow.gm_authFailure = previousHandler;
      }
    };
  }, []);

  if (!apiKey || !mapId)
    return (
      <GoogleMapConfigurationContext.Provider value={value}>
        <PlacesProviderContext.Provider value={{ provider: null, providerId: "google" }}>
          {children}
        </PlacesProviderContext.Provider>
      </GoogleMapConfigurationContext.Provider>
    );

  return (
    <GoogleMapConfigurationContext.Provider value={value}>
      <APIProvider
        apiKey={apiKey}
        authReferrerPolicy="origin"
        key={locale}
        language={locale}
        libraries={["places", "marker"]}
        onError={(error) =>
          setApiError(error instanceof Error ? error.message : "Google Maps could not be loaded.")
        }
        version="quarterly"
      >
        <GooglePlacesProviderBridge>{children}</GooglePlacesProviderBridge>
      </APIProvider>
    </GoogleMapConfigurationContext.Provider>
  );
}
