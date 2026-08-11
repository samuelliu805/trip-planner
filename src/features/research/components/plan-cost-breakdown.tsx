"use client";

import { ChevronDown } from "lucide-react";

import { formatMoney } from "../money";
import type { ConvertedPlanCostLine, PlanCostSummary } from "../types";

const typeLabels: Partial<Record<ConvertedPlanCostLine["type"], string>> = {
  activity: "Activity",
  car_rental: "Rental",
  flight: "Flight",
  hotel: "Stay",
  meal: "Meal",
  train: "Train",
  transport: "Transport",
};

export function costSummaryText(summary: PlanCostSummary) {
  if (!summary.itemCount) return "No priced items";
  if (summary.amount === null) return "Rate unavailable";
  return formatMoney(summary.amount, summary.currency);
}

export function PlanCostBreakdown({
  lines,
  summary,
}: {
  lines: ConvertedPlanCostLine[];
  summary: PlanCostSummary;
}) {
  if (!lines.length)
    return <p className="px-3 py-4 text-xs text-muted-foreground">No priced items yet.</p>;
  return (
    <div className="min-w-0">
      <ul className="divide-y" aria-label="Plan cost breakdown">
        {lines.map((line) => (
          <li
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-xs"
            key={line.itemId}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{line.title}</span>
              <span className="block text-[10px] text-muted-foreground">
                Day {line.dayNumber} · {typeLabels[line.type] ?? "Plan item"}
              </span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block whitespace-nowrap font-semibold">
                {line.convertedAmount === null
                  ? "Rate unavailable"
                  : formatMoney(line.convertedAmount, line.convertedCurrency)}
              </span>
              {line.currency !== line.convertedCurrency ? (
                <span className="block whitespace-nowrap text-[10px] text-muted-foreground">
                  {line.currency} {formatMoney(line.amount, line.currency)} original
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {summary.converted || !summary.complete ? (
        <p className="border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
          {summary.rateDate
            ? `Converted to ${summary.currency} with European Central Bank reference rates from ${summary.rateDate}.`
            : `A reference rate is unavailable for ${summary.unavailableCurrencies.join(", ")}.`}{" "}
          Original item prices are preserved.
        </p>
      ) : null}
    </div>
  );
}

export function PlanCostDisclosure({
  lines,
  summary,
}: {
  lines: ConvertedPlanCostLine[];
  summary: PlanCostSummary;
}) {
  return (
    <details className="group min-w-0 border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-muted-foreground">Cost</span>
          <span className="mt-0.5 block truncate text-sm font-semibold tabular-nums">
            {costSummaryText(summary)}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="overflow-hidden rounded-md border bg-muted/20">
        <PlanCostBreakdown lines={lines} summary={summary} />
      </div>
    </details>
  );
}
