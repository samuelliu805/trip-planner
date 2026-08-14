"use client";

import { Map, Route } from "lucide-react";

import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { PublicDayRoutePanel } from "./public-day-route-panel";
import { PublicOverviewRoutePanel } from "./public-overview-route-panel";
import { PublicPlannerMapCanvas } from "./public-planner-map-canvas";
import type { PublicMapWorkspaceProps } from "./public-map-workspace-types";
import { RouteScopePicker } from "./public-route-summary";
import { usePublicMapWorkspaceController } from "./use-public-map-workspace-controller";

export type { PublicMapSelection } from "./public-map-workspace-types";

const mapConfigurationState = {
  message: "The itinerary and shared stops remain available. Try the map again later.",
  title: "Map unavailable",
} as const;
const mapEmptyState = {
  message: "Shared plans stay available even when no mappable places were added.",
  title: "No shared map places",
} as const;
const mapFailureState = {
  message: "The itinerary and stop order remain available. Retry when ready.",
  title: "Map unavailable",
} as const;

export function PublicMapWorkspace(props: PublicMapWorkspaceProps) {
  return (
    <PlannerMapProvider>
      <PublicMapWorkspaceContent {...props} />
    </PlannerMapProvider>
  );
}

function PublicMapWorkspaceContent(props: PublicMapWorkspaceProps) {
  const controller = usePublicMapWorkspaceController(props);
  return (
    <section aria-label="Map and routes" className="public-map-workspace relative h-full min-h-0">
      <div className="public-map-toolbar" aria-hidden="true">
        <span>
          <Map className="size-4" /> Map & routes
        </span>
        <span>
          <Route className="size-4" /> Shared route
        </span>
      </div>
      <div className="public-map-canvas absolute inset-0 pb-[min(44%,22rem)]">
        <PublicPlannerMapCanvas
          configurationState={mapConfigurationState}
          emptyState={mapEmptyState}
          failureState={mapFailureState}
          {...controller.map}
          onRetry={() => window.location.reload()}
        />
      </div>

      <div className="public-map-panel absolute inset-x-0 bottom-0 max-h-[48%] overflow-y-auto border-t bg-background/97 p-3 backdrop-blur">
        <RouteScopePicker onSelect={controller.selectScope} scope={controller.routeScope} />
        {controller.routeScope === "overview" ? (
          <PublicOverviewRoutePanel {...controller.overviewPanel} />
        ) : (
          <PublicDayRoutePanel {...controller.dayPanel} />
        )}
      </div>
    </section>
  );
}
