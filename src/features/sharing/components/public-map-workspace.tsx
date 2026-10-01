"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { ChevronUp, ChevronRight, Route } from "lucide-react";
import { useState } from "react";

import { PullUpPanelHandle } from "@/components/ui/pull-up-panel";
import { PublicMapCalculateAction } from "./public-map-calculate-action";
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
  const { t } = useI18n();
  const controller = usePublicMapWorkspaceController(props);
  const [panelOpen, setPanelOpen] = useState(false);
  return (
    <section
      aria-label="Map and routes"
      data-i18n-aria-label={"Map and routes"}
      className="public-map-workspace relative h-full min-h-0"
    >
      <div
        className={`public-map-canvas absolute inset-0 z-0 isolate sm:pb-0 ${panelOpen ? "pb-[min(44%,22rem)] sm:pr-[min(85%,20rem)]" : "pb-11"}`}
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
        className={`public-map-panel absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden border-t sm:inset-x-auto sm:right-0 sm:border-l ${panelOpen ? "mobile-pull-up-panel max-h-[52%] sm:inset-y-0 sm:max-h-none sm:w-[min(85%,20rem)]" : "max-h-11 sm:bottom-auto sm:right-3 sm:top-3 sm:rounded-lg sm:border sm:shadow-sm"}`}
      >
        {panelOpen ? (
          <PullUpPanelHandle className="sm:hidden" onClose={() => setPanelOpen(false)} />
        ) : null}
        <button
          aria-label={t(panelOpen ? "Close route panel" : "Open route panel")}
          aria-expanded={panelOpen}
          className="public-map-panel-toggle shrink-0 z-10 flex min-h-11 w-full items-center gap-2 border-b px-3 text-left text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => setPanelOpen((current) => !current)}
          type="button"
        >
          <Route aria-hidden="true" className="size-4 text-primary" />
          <span>
            <Localized
              value={controller.routeScope === "overview" ? "Whole trip routes" : "Day route"}
            />
          </span>
          {!panelOpen ? (
            <ChevronUp aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
          ) : null}
          {panelOpen ? (
            <ChevronRight aria-hidden="true" className="ml-auto hidden size-4 sm:block" />
          ) : null}
        </button>
        {panelOpen ? (
          <>
            <div className="shrink-0 space-y-2 border-b p-3">
              <RouteScopePicker onSelect={controller.selectScope} scope={controller.routeScope} />
              <PublicMapCalculateAction controller={controller} />
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
              {controller.routeScope === "overview" ? (
                <PublicOverviewRoutePanel
                  {...controller.overviewPanel}
                  showCalculateAction={false}
                />
              ) : (
                <PublicDayRoutePanel {...controller.dayPanel} showCalculateAction={false} />
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
