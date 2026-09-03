"use client";

import { createContext, useContext } from "react";

import type { PlacesProviderState } from "./contracts";

export const PlacesProviderContext = createContext<PlacesProviderState>({ provider: null });

export function usePlacesProviderContext() {
  return useContext(PlacesProviderContext);
}
