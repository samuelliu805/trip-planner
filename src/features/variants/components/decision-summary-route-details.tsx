"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Bike, CarFront, Footprints, Route, TrainFront } from "lucide-react";
import { formatSummaryDistance } from "@/features/variants/decision-summary-presentation";
import type { DecisionSummaryMetricVisibility } from "@/features/variants/decision-summary-presentation";
import type { VariantDecisionSummary } from "@/features/variants/decision-summary-types";

function ModeDistanceDelta({ label, value }: { label: string; value: number | null | undefined }) {
  const { t } = useI18n();
  if (value === null || value === undefined) return null;
  const distance = formatSummaryDistance(Math.abs(value));
  const accessibleLabel =
    value === 0
      ? `Same ${label.toLowerCase()} distance as Primary`
      : `${distance} ${value > 0 ? "greater" : "less"} ${label.toLowerCase()} distance versus Primary`;
  return (
    <span
      aria-label={accessibleLabel}
      className="inline-flex rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      {value === 0
        ? t("Same as Primary")
        : t("{distance} vs Primary", { distance: `${value > 0 ? "+" : "−"}${distance}` })}
    </span>
  );
}

function ModeIcon({ mode }: { mode: string }) {
  if (mode === "walk") return <Footprints aria-hidden="true" className="size-3.5" />;
  if (["self_driving", "taxi", "rideshare", "motorcycle"].includes(mode))
    return <CarFront aria-hidden="true" className="size-3.5" />;
  if (mode === "bike") return <Bike aria-hidden="true" className="size-3.5" />;
  if (["bus", "subway", "tram", "shuttle", "train", "cable_car"].includes(mode))
    return <TrainFront aria-hidden="true" className="size-3.5" />;
  return <Route aria-hidden="true" className="size-3.5" />;
}

export function DecisionSummaryRouteDistanceByMode({
  modes,
  summary,
}: {
  modes: DecisionSummaryMetricVisibility["routeDistanceModes"];
  summary: VariantDecisionSummary;
}) {
  const distanceByMode = new Map(
    summary.savedDayRouteDistanceByMode.map(({ distanceMeters, mode }) => [mode, distanceMeters]),
  );
  const deltaByMode = new Map(
    summary.deltas?.dayRouteDistanceByMode?.map(({ distanceMeters, mode }) => [
      mode,
      distanceMeters,
    ]) ?? [],
  );
  return (
    <section
      aria-label="Current saved route distance by mode"
      data-i18n-aria-label={"Current saved route distance by mode"}
      className="py-2"
    >
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {modes.map(({ label, mode }) => (
          <div className="flex min-w-0 items-center gap-1.5" key={mode}>
            <span className="text-muted-foreground">
              <ModeIcon mode={mode} />
            </span>
            <dt className="text-sm font-normal text-muted-foreground">
              <Localized value={label} />
            </dt>
            <dd className="text-sm font-normal tabular-nums">
              {summary.knownDayRouteDistanceMeters === null ? (
                <T message="Not calculated" />
              ) : (
                formatSummaryDistance(distanceByMode.get(mode) ?? 0)
              )}
            </dd>
            <ModeDistanceDelta label={label} value={deltaByMode.get(mode)} />
          </div>
        ))}
      </dl>
    </section>
  );
}
