"use client";

import { ChevronDown, CircleDot, Route } from "lucide-react";

import { DecisionSummaryMetric } from "@/features/variants/components/decision-summary-card-elements";
import { PlanCostDisclosure } from "@/features/research/components/plan-cost-breakdown";
import { DecisionSummaryHotelDetails } from "@/features/variants/components/decision-summary-hotel-details";
import {
  DecisionSummaryCoverageDetails,
  DecisionSummaryRouteDistanceByMode,
  DecisionSummaryTripTransportItems,
} from "@/features/variants/components/decision-summary-route-details";
import type { DecisionSummaryMetricVisibility } from "@/features/variants/decision-summary-presentation";
import type { VariantDecisionSummary } from "@/features/variants/decision-summary-types";

export function DecisionSummaryCard({
  activeVariantId,
  summary,
  visibility,
}: {
  activeVariantId: string;
  summary: VariantDecisionSummary;
  visibility: DecisionSummaryMetricVisibility;
}) {
  const isActive = activeVariantId === summary.variantId;
  return (
    <article
      aria-label={
        summary.name +
        (summary.isPrimary ? ", Primary baseline" : "") +
        (isActive ? ", Editing" : ", Read only")
      }
      className="min-w-0 rounded-lg border bg-background p-3 shadow-sm"
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CircleDot
              aria-hidden="true"
              className="size-4 shrink-0"
              style={{ color: summary.color }}
            />
            <h3 className="truncate text-sm font-semibold">{summary.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {summary.isPrimary ? (
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium">
                Primary · baseline
              </span>
            ) : null}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {isActive ? "Editing" : "Read only"}
            </span>
          </div>
        </div>
        {!summary.isPrimary ? (
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">vs Primary</span>
        ) : null}
      </header>

      <dl className="mt-1">
        <DecisionSummaryMetric
          label="Cities / towns"
          value={summary.citySequence.length ? summary.citySequence.join(" → ") : "No places yet"}
        />
        <PlanCostDisclosure lines={summary.costBreakdown} summary={summary.cost} />
        <DecisionSummaryMetric
          delta={summary.deltas?.days}
          deltaKind="planning day"
          label="Days"
          value={summary.dayCount + (summary.dayCount === 1 ? " day" : " days")}
        />
        {visibility.nights ? (
          <DecisionSummaryMetric
            delta={summary.deltas?.nights}
            deltaKind="night"
            detail={summary.nightUnknownReason?.toLowerCase()}
            label="Nights"
            value={
              summary.nightCount === null
                ? "Unknown"
                : summary.nightCount + (summary.nightCount === 1 ? " night" : " nights")
            }
          />
        ) : null}
      </dl>
      {visibility.routeDistanceModes.length ||
      visibility.tripTransportModes ||
      visibility.routeCoverage ? (
        <details className="group border-t">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex items-center gap-2">
              <Route aria-hidden="true" className="size-4 text-muted-foreground" />
              Route details
            </span>
            <span className="flex items-center gap-2 text-[10px] font-normal text-muted-foreground">
              {summary.routeCoverage.totalSavedPlans
                ? `${summary.routeCoverage.totalSavedPlans} saved`
                : "No saved Day routes"}
              <ChevronDown
                aria-hidden="true"
                className="size-4 transition-transform group-open:rotate-180"
              />
            </span>
          </summary>
          <div className="border-t">
            {visibility.routeDistanceModes.length ? (
              <DecisionSummaryRouteDistanceByMode
                modes={visibility.routeDistanceModes}
                summary={summary}
              />
            ) : null}
            {visibility.tripTransportModes ? (
              <DecisionSummaryTripTransportItems summary={summary} />
            ) : null}
            {visibility.routeCoverage ? (
              <DecisionSummaryCoverageDetails
                showSavedModes={visibility.savedDayRouteModes}
                summary={summary}
              />
            ) : null}
          </div>
        </details>
      ) : null}
      <DecisionSummaryHotelDetails summary={summary} />
    </article>
  );
}
