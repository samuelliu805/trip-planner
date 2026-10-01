"use client";

import { Calculator, LoaderCircle, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Localized } from "@/features/i18n/i18n-provider";
import { usePublicMapWorkspaceController } from "./use-public-map-workspace-controller";

type Controller = ReturnType<typeof usePublicMapWorkspaceController>;

export function PublicMapCalculateAction({ controller }: { controller: Controller }) {
  const overview = controller.routeScope === "overview";
  const panel = overview ? controller.overviewPanel : controller.dayPanel;
  if (!panel.allowExplore) return null;
  const day = controller.dayPanel;
  const editing = Boolean(panel.calculation);
  const settingUp = !overview && !day.exploring;
  const disabled =
    panel.pending ||
    (overview
      ? controller.overviewPanel.stops.length < 2 || controller.overviewPanel.stops.length > 20
      : settingUp
        ? day.candidates.length < 2
        : !editing && day.localStops.length < 2);
  const label = panel.pending
    ? "Calculating…"
    : editing
      ? " Edit route "
      : settingUp
        ? day.route
          ? " Edit route "
          : "Explore route"
        : overview
          ? "Calculate whole trip"
          : "Calculate";
  return (
    <Button
      aria-busy={panel.pending}
      className="public-map-calculate min-h-11 w-full"
      disabled={disabled}
      onClick={() => {
        if (editing) {
          if (overview) controller.overviewPanel.onReset();
          else day.onEdit();
        } else if (settingUp) day.onExplore();
        else panel.onCalculate();
      }}
      type="button"
    >
      {panel.pending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : settingUp ? (
        <Route aria-hidden="true" className="size-4" />
      ) : (
        <Calculator aria-hidden="true" className="size-4" />
      )}
      <Localized value={label} />
    </Button>
  );
}
