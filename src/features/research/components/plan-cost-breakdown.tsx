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
  return formatMoney(summary.amount, summary.currency);
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
      <p className="px-3 py-4 text-xs text-muted-foreground">
        <T message={"No priced items yet."} />
      </p>
    );
  return (
    <div className="min-w-0">
      <ul
        className="divide-y"
        aria-label="Plan cost breakdown"
        data-i18n-aria-label={"Plan cost breakdown"}
      >
        {lines.map((line) => (
          <li
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-xs"
            key={line.itemId}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{line.title}</span>
              <span className="block text-[10px] text-muted-foreground">
                <T message={"Day {day}"} values={{ day: line.dayNumber }} /> ·{" "}
                <Localized value={typeLabels[line.type] ?? "Plan item"} />
              </span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block whitespace-nowrap font-semibold">
                {line.convertedAmount === null ? (
                  <T message="Rate unavailable" />
                ) : (
                  formatMoney(line.convertedAmount, line.convertedCurrency)
                )}
              </span>
              {line.currency !== line.convertedCurrency ? (
                <span className="block whitespace-nowrap text-[10px] text-muted-foreground">
                  {line.currency} {formatMoney(line.amount, line.currency)}{" "}
                  <T message={" original "} />
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {summary.converted || !summary.complete ? (
        <p className="border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
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
