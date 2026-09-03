"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { PlacesProviderContext } from "@/lib/providers/places/client-context";
import { createAmapPlacesProvider } from "@/lib/providers/amap/places/amap-places-provider";

import type { AmapNamespace } from "../sdk-types";
import { amapJsApiLoader } from "./amap-loader";

type AmapMapConfiguration = {
  amap?: AmapNamespace;
  apiError?: string;
  apiKey?: string;
  retry(): void;
};

const AmapMapConfigurationContext = createContext<AmapMapConfiguration>({ retry() {} });

export function useAmapMapConfiguration() {
  return useContext(AmapMapConfigurationContext);
}

export function AmapMapsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY;
  const [amap, setAmap] = useState<AmapNamespace>();
  const [apiError, setApiError] = useState<string>();
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!apiKey) return;
    let active = true;
    const serviceHost = new URL("/_AMapService", window.location.origin).toString();
    const lease = amapJsApiLoader.acquire({ apiKey, serviceHost });
    void lease.load.then(
      (loaded) => {
        if (active) setAmap(loaded);
      },
      (error: unknown) => {
        if (active)
          setApiError(error instanceof Error ? error.message : "AMap JS API could not be loaded.");
      },
    );
    return () => {
      active = false;
      lease.release();
    };
  }, [apiKey, retryKey]);

  const placesProvider = useMemo(() => (amap ? createAmapPlacesProvider() : null), [amap]);
  const value = {
    amap,
    apiError,
    apiKey,
    retry: () => {
      setAmap(undefined);
      setApiError(undefined);
      setRetryKey((value) => value + 1);
    },
  };

  return (
    <AmapMapConfigurationContext.Provider value={value}>
      <PlacesProviderContext.Provider
        value={{
          ...(apiError ? { error: new Error(apiError) } : null),
          provider: placesProvider,
          providerId: "amap",
        }}
      >
        {children}
      </PlacesProviderContext.Provider>
    </AmapMapConfigurationContext.Provider>
  );
}
