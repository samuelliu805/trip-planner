"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { DecisionSummaryModeList } from "@/features/variants/components/decision-summary-card-elements";
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
      className="border-t py-2"
    >
      <h4 className="text-[11px] font-medium text-muted-foreground">
        <T message={" Saved distance by mode "} />
      </h4>
      <dl className="mt-2 space-y-1.5">
        {modes.map(({ label, mode }) => (
          <div className="flex items-center justify-between gap-3" key={mode}>
            <div>
              <dt className="text-[11px] text-muted-foreground">
                <Localized value={label} /> <T message={" distance"} />
              </dt>
              <dd className="text-sm font-semibold">
                {summary.knownDayRouteDistanceMeters === null ? (
                  <T message="Not calculated" />
                ) : (
                  formatSummaryDistance(distanceByMode.get(mode) ?? 0)
                )}
              </dd>
            </div>
            <ModeDistanceDelta label={label} value={deltaByMode.get(mode)} />
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DecisionSummaryTripTransportItems({
  summary,
}: {
  summary: VariantDecisionSummary;
}) {
  return (
    <div className="border-t py-2 text-[11px]">
      <p className="mb-1 font-medium text-muted-foreground">
        <T message={"Trip transport items"} />
      </p>
      <DecisionSummaryModeList
        empty="No explicit trip transport modes"
        modes={summary.tripTransportModes}
      />
    </div>
  );
}
