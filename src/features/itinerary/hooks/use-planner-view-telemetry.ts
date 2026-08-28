"use client";

import { useEffect, useState } from "react";

import {
  createPlannerViewReporter,
  plannerViewForLayout,
} from "@/features/itinerary/planner-view-telemetry";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

export function usePlannerViewTelemetry(mapExpanded: boolean) {
  const [splitLayout, setSplitLayout] = useState<boolean | null>(null);
  const [reportView] = useState(() =>
    createPlannerViewReporter((plannerView) =>
      captureBrowserProductEvent(
        "planner_view_changed",
        { planner_view: plannerView, surface: "planner" },
        { actorType: "authenticated" },
      ),
    ),
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const update = () => setSplitLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (splitLayout !== null) reportView(plannerViewForLayout(mapExpanded, splitLayout));
  }, [mapExpanded, reportView, splitLayout]);
}
