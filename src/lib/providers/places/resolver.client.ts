"use client";

import { useMapProviderConfiguration } from "@/lib/providers/maps/client-context";

import { usePlacesProviderContext } from "./client-context";
import type { PlacesProviderState } from "./contracts";

export function usePlacesProvider(): PlacesProviderState {
  const state = usePlacesProviderContext();
  const { providerError } = useMapProviderConfiguration();
  return providerError ? { error: providerError, provider: null } : state;
}
