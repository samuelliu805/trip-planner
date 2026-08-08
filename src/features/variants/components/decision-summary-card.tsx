"use client";

import { CircleDot } from "lucide-react";

import { DecisionSummaryMetric } from "@/features/variants/components/decision-summary-card-elements";
import { DecisionSummaryHotelDetails } from "@/features/variants/components/decision-summary-hotel-details";
import {
  DecisionSummaryCoverageDetails,
  DecisionSummaryRouteDistanceByMode,
  DecisionSummaryTripTransportItems,
} from "@/features/variants/components/decision-summary-route-details";
import { formatSummaryDistance } from "@/features/variants/decision-summary-presentation";
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
  const citySpanValue =
    summary.citySpanMeters === null
      ? "Not available"
      : formatSummaryDistance(summary.citySpanMeters);
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

      <div className="rounded-md bg-muted/40 p-2">
        <p className="text-[11px] font-medium text-muted-foreground">Locality sequence</p>
        <p className="mt-0.5 text-xs font-medium">
          {summary.citySequence.length ? summary.citySequence.join(" → ") : "No locality stages"}
        </p>
      </div>

      <dl className="mt-1">
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
        <DecisionSummaryMetric
          delta={summary.deltas?.cityStages}
          deltaKind="locality stage"
          label="Locality stages"
          value={summary.cityStageCount.toLocaleString()}
        />
        <DecisionSummaryMetric
          delta={summary.deltas?.uniqueCityPlaces}
          deltaKind="unique locality"
          label="Unique localities"
          value={summary.uniqueCityPlaceCount.toLocaleString()}
        />
        <DecisionSummaryMetric
          delta={summary.deltas?.uniquePlannedPlaces}
          deltaKind="unique planned place"
          detail={summary.plannedPlaceOccurrenceCount + " place-linked item occurrences"}
          label="Unique planned places"
          value={summary.uniquePlannedPlaces.toLocaleString()}
        />
        {visibility.citySpan ? (
          <DecisionSummaryMetric
            delta={summary.deltas?.citySpanMeters}
            deltaKind="locality span"
            detail="Straight-line Overview stage connections; never combined with routed distance"
            label="Locality span · straight-line"
            value={citySpanValue}
          />
        ) : null}
      </dl>

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
      <DecisionSummaryHotelDetails summary={summary} />
    </article>
  );
}
