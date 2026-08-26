"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { CalendarDays, CircleDot, MapPin, Route } from "lucide-react";

import {
  DecisionSummaryDisclosureSummary,
  DecisionSummaryMetric,
} from "@/features/variants/components/decision-summary-card-elements";
import { DecisionSummaryCostDetails } from "@/features/variants/components/decision-summary-cost-details";
import { DecisionSummaryHotelDetails } from "@/features/variants/components/decision-summary-hotel-details";
import { DecisionSummaryRouteDistanceByMode } from "@/features/variants/components/decision-summary-route-details";
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
      className="min-w-0 overflow-hidden rounded-lg border bg-background p-3 shadow-sm"
    >
      <header className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CircleDot
            aria-hidden="true"
            className="size-4 shrink-0"
            style={{ color: summary.color }}
          />
          <h3 className="truncate text-base font-semibold">{summary.name}</h3>
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
          icon={MapPin}
          label="Cities"
          value={summary.citySequence.length ? summary.citySequence.join(" → ") : "No places yet"}
        />
        <DecisionSummaryCostDetails lines={summary.costBreakdown} summary={summary.cost} />
        <DecisionSummaryMetric
          detail={summary.nightUnknownReason?.toLowerCase()}
          icon={CalendarDays}
          label="Days & nights"
          value={`${t("{count} day(s)", { count: summary.dayCount })} · ${
            summary.nightCount === null
              ? t("Unknown nights")
              : t("{count} night(s)", { count: summary.nightCount })
          }`}
        />
      </dl>
      {visibility.routeDistanceModes.length ? (
        <details className="group border-t">
          <DecisionSummaryDisclosureSummary
            icon={Route}
            label={<T message={" Route details "} />}
          />
          <div className="border-t">
            <DecisionSummaryRouteDistanceByMode
              modes={visibility.routeDistanceModes}
              summary={summary}
            />
          </div>
        </details>
      ) : null}
      <DecisionSummaryHotelDetails summary={summary} />
    </article>
  );
}
