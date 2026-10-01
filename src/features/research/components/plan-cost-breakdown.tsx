"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";

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
  return formatMoney(summary.amount, summary.currency, "code");
}

export function PlanCostBreakdown({
  lines,
  summary,
}: {
  lines: ConvertedPlanCostLine[];
  summary: PlanCostSummary;
}) {
  const { t } = useI18n();
  if (!lines.length)
    return (
      <p className="px-5 py-4 text-sm text-muted-foreground">
        <T message={"No priced items yet."} />
      </p>
    );
  return (
    <div className="plan-cost-breakdown min-w-0 font-sans">
      <ul
        className="divide-y"
        aria-label="Plan cost breakdown"
        data-i18n-aria-label={"Plan cost breakdown"}
      >
        {lines.map((line) => (
          <li
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-4 px-5 py-4 text-sm"
            key={line.itemId}
          >
            <span className="min-w-0">
              <span className="block break-words font-medium leading-snug">{line.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                <T message={"Day {day}"} values={{ day: line.dayNumber }} /> ·{" "}
                <Localized value={typeLabels[line.type] ?? "Plan item"} />
              </span>
            </span>
            <span className="min-w-0 text-right tabular-nums">
              <span className="block break-words font-semibold leading-snug">
                {line.convertedAmount === null ? (
                  <T message="Rate unavailable" />
                ) : (
                  formatMoney(line.convertedAmount, line.convertedCurrency)
                )}
              </span>
              {line.currency !== line.convertedCurrency ? (
                <span className="mt-1 block break-words text-xs leading-relaxed text-muted-foreground">
                  {formatMoney(line.amount, line.currency, "code")} <T message={" original "} />
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {summary.converted || !summary.complete ? (
        <p className="border-t border-dashed bg-muted/20 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          {summary.rateDate
            ? t("Converted to {currency} with European Central Bank reference rates from {date}.", {
                currency: summary.currency,
                date: summary.rateDate,
              })
            : t("A reference rate is unavailable for {currencies}.", {
                currencies: summary.unavailableCurrencies.join(", "),
              })}{" "}
          <T message={" Original item prices are preserved. "} />
        </p>
      ) : null}
    </div>
  );
}
