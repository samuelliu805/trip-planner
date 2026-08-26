"use client";

import { Localized } from "@/features/i18n/i18n-provider";
import { ChevronDown, type LucideIcon } from "lucide-react";

export function DecisionSummaryMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail?: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-t first:border-t-0">
      <div className="flex min-h-11 items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <dt className="sr-only">
              <Localized value={label} />
            </dt>
            <dd className="break-words text-sm font-normal leading-5">{value}</dd>
            {detail ? <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DecisionSummaryDisclosureSummary({
  icon: Icon,
  label,
  trailing,
}: {
  icon: LucideIcon;
  label: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-normal leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
        {trailing}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-180"
        />
      </span>
    </summary>
  );
}
