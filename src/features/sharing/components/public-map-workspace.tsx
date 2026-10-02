"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { ChevronUp, ChevronDown, Route } from "lucide-react";
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
  const [panelOpen, setPanelOpen] = useState(true);
  return (
    <section
      aria-label="Map and routes"
      data-i18n-aria-label={"Map and routes"}
      className="public-map-workspace relative flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="public-map-canvas relative z-0 min-h-0 flex-1 isolate overflow-hidden">
        <PublicPlannerMapCanvas
          configurationState={mapConfigurationState}
          emptyState={mapEmptyState}
          failureState={mapFailureState}
          {...controller.map}
          onRetry={() => window.location.reload()}
        />
      </div>

      <div
        className={`public-map-panel relative z-20 flex shrink-0 flex-col overflow-hidden border-t ${panelOpen ? "mobile-pull-up-panel max-h-[52%]" : "max-h-11"}`}
      >
        {panelOpen ? (
          <PullUpPanelHandle
            className="h-5 sm:hidden"
            handleOnly
            onClose={() => setPanelOpen(false)}
          />
        ) : null}
        {!panelOpen ? (
          <button
            aria-label={t("Open route panel")}
            aria-expanded={panelOpen}
            className="public-map-panel-toggle z-10 flex min-h-11 w-full shrink-0 items-center gap-2 border-b px-3 text-left text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => setPanelOpen(true)}
            type="button"
          >
            <Route aria-hidden="true" className="size-4 text-primary" />
            <span>
              <Localized
                value={controller.routeScope === "overview" ? "Whole trip routes" : "Day route"}
              />
            </span>
            <ChevronUp aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
          </button>
        ) : null}
        {panelOpen ? (
          <>
            <div className="public-map-panel-toolbar flex shrink-0 items-center gap-1 border-b px-2">
              <RouteScopePicker onSelect={controller.selectScope} scope={controller.routeScope} />
              <button
                aria-label={t("Close route panel")}
                aria-expanded={panelOpen}
                className="public-map-panel-toggle flex size-11 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => setPanelOpen(false)}
                type="button"
              >
                <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
              </button>
            </div>
            <div className="public-map-panel-body min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
              <PublicMapCalculateAction controller={controller} />
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
