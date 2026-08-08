import { Compass, MapPinned, Route } from "lucide-react";

import { RouteLegDetails, type RouteLegDetail } from "@/features/routes/route-leg-details";
import { formatDistance, formatDuration } from "../presentation";
import type { PublicRouteCalculation } from "../types";

export function RouteTotals({ calculation }: { calculation: PublicRouteCalculation }) {
  return (
    <p className="flex min-h-9 items-center gap-2 border px-2.5 text-xs text-muted-foreground">
      <MapPinned aria-hidden="true" className="size-4 shrink-0" />
      {[
        formatDistance(calculation.totalDistanceMeters),
        formatDuration(calculation.totalDurationSeconds),
      ]
        .filter(Boolean)
        .join(" · ") || "Route calculated"}
    </p>
  );
}

export function PublicRouteLegDetails({
  defaultOpen = true,
  labels,
  legs,
}: {
  defaultOpen?: boolean;
  labels: string[];
  legs: PublicRouteCalculation["legs"];
}) {
  const details: RouteLegDetail[] = legs.map((leg) => ({
    ...leg,
    fromLabel: labels[leg.position - 1],
    toLabel: labels[leg.position],
  }));
  return <RouteLegDetails defaultOpen={defaultOpen} legs={details} />;
}

export function RouteScopePicker({
  onSelect,
  scope,
}: {
  onSelect: (scope: "day" | "overview") => void;
  scope: "day" | "overview";
}) {
  return (
    <div aria-label="Route scope" className="mb-2 grid grid-cols-2 border" role="group">
      <button
        aria-pressed={scope === "overview"}
        className="flex min-h-11 items-center justify-center gap-2 border-r px-3 text-xs font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        onClick={() => onSelect("overview")}
        type="button"
      >
        <Compass aria-hidden="true" className="size-4" /> Whole trip
      </button>
      <button
        aria-pressed={scope === "day"}
        className="flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        onClick={() => onSelect("day")}
        type="button"
      >
        <Route aria-hidden="true" className="size-4" /> Day route
      </button>
    </div>
  );
}
