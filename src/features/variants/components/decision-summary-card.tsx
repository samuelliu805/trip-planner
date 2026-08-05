"use client";

import { ChevronDown, CircleDot, Hotel, Route } from "lucide-react";

import type { NeutralDeltaKind } from "@/features/variants/decision-summary-presentation";
import {
  formatHotelAlignmentLabel,
  formatSummaryDistance,
  neutralDeltaAccessibleLabel,
  neutralDeltaLabel,
} from "@/features/variants/decision-summary-presentation";
import type { DecisionSummaryMetricVisibility } from "@/features/variants/decision-summary-presentation";
import type {
  DecisionSummaryModeCount,
  VariantDecisionSummary,
} from "@/features/variants/decision-summary-types";

function DeltaChip({ kind, value }: { kind: NeutralDeltaKind; value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <span
      aria-label={neutralDeltaAccessibleLabel(kind, value)}
      className="inline-flex rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      {neutralDeltaLabel(kind, value)}
    </span>
  );
}

function Metric({
  delta,
  deltaKind,
  detail,
  label,
  value,
}: {
  delta?: number | null;
  deltaKind?: NeutralDeltaKind;
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-t py-2 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
          {detail ? <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p> : null}
        </div>
        {deltaKind ? <DeltaChip kind={deltaKind} value={delta} /> : null}
      </div>
    </div>
  );
}

function ModeList({ empty, modes }: { empty: string; modes: DecisionSummaryModeCount<string>[] }) {
  if (!modes.length) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {modes.map(({ count, label, mode }) => (
        <span className="rounded-full border px-2 py-0.5" key={mode}>
          {label} · {count}
        </span>
      ))}
    </span>
  );
}

function CoverageDetails({
  showSavedModes,
  summary,
}: {
  showSavedModes: boolean;
  summary: VariantDecisionSummary;
}) {
  const coverage = summary.routeCoverage;
  return (
    <details className="group border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          <Route aria-hidden="true" className="size-4 text-muted-foreground" />
          Route coverage
        </span>
        <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {coverage.totalSavedPlans
            ? coverage.current + " current / " + coverage.totalSavedPlans + " saved"
            : "No saved Day routes"}
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
                <dt>Current</dt>
                <dd>{coverage.current}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Uncalculated</dt>
                <dd>{coverage.uncalculated}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Stale</dt>
                <dd>{coverage.stale}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Needs editing</dt>
                <dd>{coverage.needs_edit}</dd>
              </div>
              {coverage.updating ? (
                <div className="flex justify-between gap-2">
                  <dt>Updating</dt>
                  <dd>{coverage.updating}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt>Current calculated legs</dt>
                <dd>{coverage.currentCalculatedLegCount}</dd>
              </div>
            </dl>
            {coverage.stale || coverage.needs_edit || coverage.updating ? (
              <p className="font-medium text-muted-foreground">
                Stale, needs-editing, and updating routes are excluded from totals.
              </p>
            ) : null}
            {coverage.fallbackLegCount ? (
              <p className="text-muted-foreground">
                {coverage.fallbackLegCount} straight fallback
                {coverage.fallbackLegCount === 1 ? " leg" : " legs"} ·{" "}
                {coverage.noRouteFallbackCount} no-route · {coverage.unsupportedModeFallbackCount}{" "}
                unsupported-mode
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">
            No saved Day routes. Opening this summary never calculates routes.
          </p>
        )}
        {showSavedModes ? (
          <div>
            <p className="mb-1 font-medium">Saved Day route modes</p>
            <ModeList empty="No current saved route modes" modes={summary.savedDayRouteModes} />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function ModeDistanceDelta({ label, value }: { label: string; value: number | null | undefined }) {
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
      {value === 0 ? "Same as Primary" : `${value > 0 ? "+" : "−"}${distance} vs Primary`}
    </span>
  );
}

function RouteDistanceByMode({
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
    <section aria-label="Current saved route distance by mode" className="border-t py-2">
      <h4 className="text-[11px] font-medium text-muted-foreground">
        Current saved route distance by mode
      </h4>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        Explicit saved leg modes only; stale and needs-editing routes are excluded.
      </p>
      <dl className="mt-2 space-y-1.5">
        {modes.map(({ label, mode }) => (
          <div className="flex items-center justify-between gap-3" key={mode}>
            <div>
              <dt className="text-[11px] text-muted-foreground">{label} distance</dt>
              <dd className="text-sm font-semibold">
                {summary.knownDayRouteDistanceMeters === null
                  ? "Not calculated"
                  : formatSummaryDistance(distanceByMode.get(mode) ?? 0)}
              </dd>
            </div>
            <ModeDistanceDelta label={label} value={deltaByMode.get(mode)} />
          </div>
        ))}
      </dl>
    </section>
  );
}

function HotelDetails({ summary }: { summary: VariantDecisionSummary }) {
  const difference = summary.hotelDifference;
  const differenceLabel = difference
    ? difference.changed +
      " changed · " +
      difference.added +
      " added · " +
      difference.removed +
      " removed"
    : summary.hotelOccurrences.length +
      (summary.hotelOccurrences.length === 1 ? " occurrence" : " occurrences");
  return (
    <details className="group border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          <Hotel aria-hidden="true" className="size-4 text-muted-foreground" />
          Hotel occurrences
        </span>
        <span className="flex items-center gap-2 text-right text-[10px] text-muted-foreground">
          {differenceLabel}
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="space-y-2 pb-3 text-[11px]">
        <p className="text-muted-foreground">
          Explicit Hotel items only. An occurrence is not an inferred night.
        </p>
        {difference ? (
          <>
            <div className="flex flex-wrap gap-1">
              <span className="rounded-full border px-2 py-0.5">{difference.same} same</span>
              <span className="rounded-full border px-2 py-0.5">{difference.changed} changed</span>
              <span className="rounded-full border px-2 py-0.5">{difference.added} added</span>
              <span className="rounded-full border px-2 py-0.5">{difference.removed} removed</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <DeltaChip kind="Hotel changed" value={summary.deltas?.hotelChanged} />
              <DeltaChip kind="Hotel added" value={summary.deltas?.hotelAdded} />
              <DeltaChip kind="Hotel removed" value={summary.deltas?.hotelRemoved} />
            </div>
            {difference.entries.length ? (
              <ul className="space-y-1.5">
                {difference.entries.map((entry, index) => (
                  <li className="rounded-md bg-muted/50 p-2" key={entry.alignmentLabel + index}>
                    <span className="font-medium capitalize">{entry.status}</span>
                    {" · "}
                    {formatHotelAlignmentLabel(entry.alignmentLabel)}
                    <span className="block text-muted-foreground">
                      {entry.status === "changed"
                        ? (entry.primary?.title ?? "Hotel") +
                          " → " +
                          (entry.compared?.title ?? "Hotel")
                        : (entry.compared?.title ?? entry.primary?.title ?? "Hotel")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No Hotel occurrences in either route.</p>
            )}
          </>
        ) : summary.hotelOccurrences.length ? (
          <ul className="space-y-1">
            {summary.hotelOccurrences.map((hotel) => (
              <li className="rounded-md bg-muted/50 p-2" key={hotel.itemId}>
                {hotel.title} ·{" "}
                {hotel.date ? formatHotelAlignmentLabel(hotel.date) : "Day " + hotel.dayNumber}
              </li>
            ))}
          </ul>
        ) : (
          <p>No explicit Hotel occurrences.</p>
        )}
      </div>
    </details>
  );
}

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
        <p className="text-[11px] font-medium text-muted-foreground">City sequence</p>
        <p className="mt-0.5 text-xs font-medium">
          {summary.citySequence.length ? summary.citySequence.join(" → ") : "No City stages"}
        </p>
      </div>

      <dl className="mt-1">
        <Metric
          delta={summary.deltas?.days}
          deltaKind="planning day"
          label="Days"
          value={summary.dayCount + (summary.dayCount === 1 ? " day" : " days")}
        />
        {visibility.nights ? (
          <Metric
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
        <Metric
          delta={summary.deltas?.cityStages}
          deltaKind="City stage"
          label="City stages"
          value={summary.cityStageCount.toLocaleString()}
        />
        <Metric
          delta={summary.deltas?.uniqueCityPlaces}
          deltaKind="unique City place"
          label="Unique City places"
          value={summary.uniqueCityPlaceCount.toLocaleString()}
        />
        <Metric
          delta={summary.deltas?.uniquePlannedPlaces}
          deltaKind="unique planned place"
          detail={summary.plannedPlaceOccurrenceCount + " place-linked item occurrences"}
          label="Unique planned places"
          value={summary.uniquePlannedPlaces.toLocaleString()}
        />
        {visibility.citySpan ? (
          <Metric
            delta={summary.deltas?.citySpanMeters}
            deltaKind="City span"
            detail="Straight-line City Overview legs; never combined with routed distance"
            label="City span · straight-line"
            value={citySpanValue}
          />
        ) : null}
      </dl>

      {visibility.routeDistanceModes.length ? (
        <RouteDistanceByMode modes={visibility.routeDistanceModes} summary={summary} />
      ) : null}
      {visibility.tripTransportModes ? (
        <div className="border-t py-2 text-[11px]">
          <p className="mb-1 font-medium text-muted-foreground">Trip transport items</p>
          <ModeList empty="No explicit trip transport modes" modes={summary.tripTransportModes} />
        </div>
      ) : null}
      {visibility.routeCoverage ? (
        <CoverageDetails showSavedModes={visibility.savedDayRouteModes} summary={summary} />
      ) : null}
      <HotelDetails summary={summary} />
    </article>
  );
}
