"use client";

import { TripDetailRouteState } from "@/features/research/components/trip-detail-route-state";

export default function CompareError({ reset }: { error: Error; reset: () => void }) {
  return (
    <TripDetailRouteState
      description="Saved prices could not be loaded. Your Plan is unchanged."
      onRetry={reset}
      title="Ideas & Options"
    />
  );
}
