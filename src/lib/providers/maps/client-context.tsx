"use client";

import { createContext, useContext } from "react";

import type { MapsProviderConfigurationError, MapsProviderId } from "./provider";

export type MapProviderConfiguration = {
  providerError?: MapsProviderConfigurationError;
  providerId?: MapsProviderId;
};

export const MapProviderContext = createContext<MapProviderConfiguration>({
  providerId: "google",
});

export function useMapProviderConfiguration() {
  return useContext(MapProviderContext);
}
