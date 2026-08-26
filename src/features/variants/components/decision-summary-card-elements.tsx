"use client";

import type { NeutralDeltaKind } from "@/features/variants/decision-summary-presentation";
import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { formatSummaryDistance } from "@/features/variants/decision-summary-presentation";
import type { DecisionSummaryModeCount } from "@/features/variants/decision-summary-types";

export function DeltaChip({
  kind,
  value,
}: {
  kind: NeutralDeltaKind;
  value: number | null | undefined;
}) {
  const { locale, t } = useI18n();
  if (value === null || value === undefined) return null;
  const absolute = Math.abs(value);
  const formatted =
    kind === "locality span" || kind === "known Day route distance"
      ? formatSummaryDistance(absolute)
      : kind === "known duration"
        ? locale === "zh-CN"
          ? `${Math.round(absolute / 60)} 分钟`
          : `${Math.round(absolute / 60)} min`
        : absolute.toLocaleString(locale);
  const label =
    value === 0
      ? t("Same {metric} as Primary", { metric: t(kind) })
      : t("{value} vs Primary", { value: `${value > 0 ? "+" : "−"}${formatted}` });
  return (
    <span
      aria-label={label}
      className="inline-flex rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      {label}
    </span>
  );
}

export function DecisionSummaryMetric({
  delta,
  deltaKind,
  detail,
  hideLabel = false,
  label,
  value,
}: {
  delta?: number | null;
  deltaKind?: NeutralDeltaKind;
  detail?: string;
  hideLabel?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-t py-2 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <dt className={hideLabel ? "sr-only" : "text-[11px] font-medium text-muted-foreground"}>
            <Localized value={label} />
          </dt>
          <dd className={`${hideLabel ? "" : "mt-0.5"} text-sm font-semibold`}>{value}</dd>
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
  if (!modes.length)
    return (
      <span className="text-muted-foreground">
        <Localized value={empty} />
      </span>
    );
  return (
    <span className="flex flex-wrap gap-1">
      {modes.map(({ count, label, mode }) => (
        <span className="rounded-full border px-2 py-0.5" key={mode}>
          <Localized value={label} /> · {count}
        </span>
      ))}
    </span>
  );
}
