"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useMemo } from "react";

import { createGooglePlacesProvider } from "./google-places-provider";

export function useGooglePlacesProvider() {
  const places = useMapsLibrary("places");
  return useMemo(() => (places ? createGooglePlacesProvider(places) : null), [places]);
}
