import type { PlannerView } from "../../lib/telemetry/events.ts";

export function plannerViewForLayout(mapExpanded: boolean, splitLayout: boolean): PlannerView {
  if (mapExpanded) return "map";
  return splitLayout ? "split" : "matrix";
}

export function createPlannerViewReporter(capture: (view: PlannerView) => void) {
  let lastView: PlannerView | undefined;
  return (view: PlannerView): boolean => {
    if (lastView === view) return false;
    lastView = view;
    capture(view);
    return true;
  };
}
