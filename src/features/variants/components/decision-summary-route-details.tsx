"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ChevronDown, Route } from "lucide-react";

import { DecisionSummaryModeList } from "@/features/variants/components/decision-summary-card-elements";
import { formatSummaryDistance } from "@/features/variants/decision-summary-presentation";
import type { DecisionSummaryMetricVisibility } from "@/features/variants/decision-summary-presentation";
import type { VariantDecisionSummary } from "@/features/variants/decision-summary-types";

export function DecisionSummaryCoverageDetails({
  showSavedModes,
  summary,
}: {
  showSavedModes: boolean;
  summary: VariantDecisionSummary;
}) {
  const { t } = useI18n();
  const coverage = summary.routeCoverage;
  return (
    <details className="group border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          <Route aria-hidden="true" className="size-4 text-muted-foreground" />
          <T message={" Route coverage "} />
        </span>
        <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {coverage.totalSavedPlans
            ? t("{current} current / {total} saved", {
                current: coverage.current,
                total: coverage.totalSavedPlans,
              })
            : t("No saved Day routes")}
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="space-y-2 pb-3 text-[11px]">
        {coverage.totalSavedPlans ? (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-muted/50 p-2">
              <div className="flex justify-between gap-2">
                <dt>
                  <T message={"Current"} />
                </dt>
                <dd>{coverage.current}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>
                  <T message={"Uncalculated"} />
                </dt>
                <dd>{coverage.uncalculated}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>
                  <T message={"Stale"} />
                </dt>
                <dd>{coverage.stale}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>
                  <T message={"Needs editing"} />
                </dt>
                <dd>{coverage.needs_edit}</dd>
              </div>
              {coverage.updating ? (
                <div className="flex justify-between gap-2">
                  <dt>
                    <T message={"Updating"} />
                  </dt>
                  <dd>{coverage.updating}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt>
                  <T message={"Current calculated legs"} />
                </dt>
                <dd>{coverage.currentCalculatedLegCount}</dd>
              </div>
            </dl>
            {coverage.stale || coverage.needs_edit || coverage.updating ? (
              <p className="font-medium text-muted-foreground">
                <T
                  message={" Stale, needs-editing, and updating routes are excluded from totals. "}
                />
              </p>
            ) : null}
            {coverage.fallbackLegCount ? (
              <p className="text-muted-foreground">
                {t(
                  "{count} straight fallback leg(s) · {noRoute} no-route · {unsupported} unsupported-mode",
                  {
                    count: coverage.fallbackLegCount,
                    noRoute: coverage.noRouteFallbackCount,
                    unsupported: coverage.unsupportedModeFallbackCount,
                  },
                )}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">
            <T message={" No saved Day routes. Opening this summary never calculates routes. "} />
          </p>
        )}
        {showSavedModes ? (
          <div>
            <p className="mb-1 font-medium">
              <T message={"Saved Day route modes"} />
            </p>
            <DecisionSummaryModeList
              empty="No current saved route modes"
              modes={summary.savedDayRouteModes}
            />
          </div>
        ) : null}
      </div>
    </details>
  );
}

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
        <T message={" Current saved route distance by mode "} />
      </h4>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        <T
          message={" Explicit saved leg modes only; stale and needs-editing routes are excluded. "}
        />
      </p>
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
