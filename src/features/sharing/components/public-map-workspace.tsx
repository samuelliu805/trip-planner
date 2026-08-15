"use client";

import { ChevronUp, Route, X } from "lucide-react";
import { useState } from "react";

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
  const [panelOpen, setPanelOpen] = useState(false);
  return (
    <section aria-label="Map and routes" className="public-map-workspace relative h-full min-h-0">
      <div
        className={`public-map-canvas absolute inset-0 ${panelOpen ? "pb-[min(44%,22rem)]" : "pb-11"}`}
      >
        <PublicPlannerMapCanvas
          configurationState={mapConfigurationState}
          emptyState={mapEmptyState}
          failureState={mapFailureState}
          {...controller.map}
          onRetry={() => window.location.reload()}
        />
      </div>

      <div
        className={`public-map-panel absolute inset-x-0 bottom-0 overflow-y-auto border-t bg-background/97 backdrop-blur ${panelOpen ? "max-h-[52%]" : "max-h-11 overflow-hidden"}`}
      >
        <button
          aria-label={panelOpen ? "Close route panel" : "Open route panel"}
          aria-expanded={panelOpen}
          className="public-map-panel-toggle sticky top-0 z-10 flex min-h-11 w-full items-center gap-2 border-b bg-background/97 px-3 text-left text-xs font-semibold backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => setPanelOpen((current) => !current)}
          type="button"
        >
          <Route aria-hidden="true" className="size-4 text-primary" />
          <span>{controller.routeScope === "overview" ? "Whole trip routes" : "Day route"}</span>
          {panelOpen ? (
            <X aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
          ) : (
            <ChevronUp aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
          )}
        </button>
        {panelOpen ? (
          <div className="p-3">
            <RouteScopePicker onSelect={controller.selectScope} scope={controller.routeScope} />
            {controller.routeScope === "overview" ? (
              <PublicOverviewRoutePanel {...controller.overviewPanel} />
            ) : (
              <PublicDayRoutePanel {...controller.dayPanel} />
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
