"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ChevronDown, CircleDot, Route } from "lucide-react";

import { DecisionSummaryMetric } from "@/features/variants/components/decision-summary-card-elements";
import { PlanCostDisclosure } from "@/features/research/components/plan-cost-breakdown";
import { DecisionSummaryHotelDetails } from "@/features/variants/components/decision-summary-hotel-details";
import {
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
  const { t } = useI18n();
  const isActive = activeVariantId === summary.variantId;
  return (
    <article
      aria-label={
        summary.name +
        (summary.isPrimary ? t(", Primary baseline") : "") +
        (isActive ? t(", Editing") : t(", Read only"))
      }
      className="min-w-0 rounded-lg border bg-background p-3 shadow-sm"
    >
      <header className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CircleDot
            aria-hidden="true"
            className="size-4 shrink-0"
            style={{ color: summary.color }}
          />
          <h3 className="truncate text-sm font-semibold">{summary.name}</h3>
        </div>
        {summary.isPrimary || isActive ? (
          <span className="flex shrink-0 flex-wrap justify-end gap-1 text-[10px] font-medium">
            {summary.isPrimary ? (
              <span className="rounded-full border px-2 py-0.5">
                <T message={"Primary"} />
              </span>
            ) : null}
            {isActive ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                <Localized value="Editing" />
              </span>
            ) : null}
          </span>
        ) : null}
      </header>

      <dl className="mt-1">
        <DecisionSummaryMetric
          label="Cities"
          value={summary.citySequence.length ? summary.citySequence.join(" → ") : "No places yet"}
        />
        <PlanCostDisclosure lines={summary.costBreakdown} summary={summary.cost} />
        <DecisionSummaryMetric
          detail={summary.nightUnknownReason?.toLowerCase()}
          label="Days & nights"
          value={`${t("{count} day(s)", { count: summary.dayCount })} · ${
            summary.nightCount === null
              ? t("Unknown nights")
              : t("{count} night(s)", { count: summary.nightCount })
          }`}
        />
      </dl>
      {visibility.routeDistanceModes.length || visibility.tripTransportModes ? (
        <details className="group border-t">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex items-center gap-2">
              <Route aria-hidden="true" className="size-4 text-muted-foreground" />
              <T message={" Route details "} />
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
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
          </div>
        </details>
      ) : null}
      <DecisionSummaryHotelDetails summary={summary} />
    </article>
  );
}
