"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { createGooglePlacesProvider } from "./google-places-provider";
import { createGoogleServerPlacesProvider } from "./google-server-places-provider";

const tripPath =
  /^\/trips\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;

export function useGooglePlacesProvider() {
  const places = useMapsLibrary("places");
  const pathname = usePathname();
  const tripId = pathname.match(tripPath)?.[1];
  return useMemo(() => {
    if (!places) return null;
    const fallbackProvider = tripId
      ? createGoogleServerPlacesProvider({
          endpoint: `/api/trips/${tripId}/maps/google/places`,
        })
      : undefined;
    return createGooglePlacesProvider(places, { fallbackProvider });
  }, [places, tripId]);
}
