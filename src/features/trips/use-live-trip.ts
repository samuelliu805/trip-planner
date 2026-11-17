"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Trip } from "@/platform/contracts/trips";

export function usePublishedTripSettings(tripId: string) {
  return useQuery<Trip>({ queryKey: ["trip-settings", tripId], enabled: false }).data;
}

/** Share accepted settings with every view while preserving unrelated live data. */
export function useLiveTrip<T extends Trip>(trip: T, enabled = true): T {
  const settings = usePublishedTripSettings(trip.id);
  return useMemo(() => {
    if (!enabled || !settings) return trip;
    const contentVersion = Math.max(trip.content_version, settings.content_version);
    if (settings.version < trip.version)
      return contentVersion === trip.content_version
        ? trip
        : { ...trip, content_version: contentVersion };
    return {
      ...trip,
      title: settings.title,
      start_date: settings.start_date,
      end_date: settings.end_date,
      day_count: settings.day_count,
      timezone: settings.timezone,
      currency: settings.currency,
      version: settings.version,
      content_version: contentVersion,
    };
  }, [trip, settings, enabled]);
}
