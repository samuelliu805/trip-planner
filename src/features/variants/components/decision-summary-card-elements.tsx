"use client";

import type { NeutralDeltaKind } from "@/features/variants/decision-summary-presentation";
import {
  neutralDeltaAccessibleLabel,
  neutralDeltaLabel,
} from "@/features/variants/decision-summary-presentation";
import type { DecisionSummaryModeCount } from "@/features/variants/decision-summary-types";

export function DeltaChip({
  kind,
  value,
}: {
  kind: NeutralDeltaKind;
  value: number | null | undefined;
}) {
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

export function DecisionSummaryMetric({
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

export function DecisionSummaryModeList({
  empty,
  modes,
}: {
  empty: string;
  modes: DecisionSummaryModeCount<string>[];
}) {
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
