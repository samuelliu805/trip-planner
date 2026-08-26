"use client";

import { CircleDollarSign } from "lucide-react";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { costSummaryText } from "@/features/research/components/plan-cost-breakdown";
import { DecisionSummaryDisclosureSummary } from "@/features/variants/components/decision-summary-card-elements";
import {
  decisionSummaryCostDates,
  groupDecisionSummaryCosts,
} from "@/features/variants/decision-summary-cost-groups";
import { formatMoney } from "@/features/research/money";
import type { ConvertedPlanCostLine, PlanCostSummary } from "@/features/research/types";

export function DecisionSummaryCostDetails({
  lines,
  summary,
}: {
  lines: ConvertedPlanCostLine[];
  summary: PlanCostSummary;
}) {
  const { locale, t } = useI18n();
  const groups = groupDecisionSummaryCosts(lines);
  return (
    <details className="group min-w-0 border-t">
      <DecisionSummaryDisclosureSummary
        icon={CircleDollarSign}
        label={
          <span className="block truncate tabular-nums">
            <Localized value={costSummaryText(summary)} />
          </span>
        }
        trailing={<T message="Breakdown" />}
      />
      <div className="overflow-hidden rounded-md border bg-muted/20">
        <ul className="divide-y" aria-label={t("Plan cost breakdown")}>
          {groups.map((group) => (
            <li
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-xs"
              key={group.itemIds.join(":")}
            >
              <span className="min-w-0">
                <span className="block truncate font-normal">{group.title}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {decisionSummaryCostDates(group, locale, (day) => t("Day {day}", { day }))}
                </span>
              </span>
              <span className="text-right font-normal tabular-nums">
                <span className="block whitespace-nowrap font-normal">
                  {group.convertedAmount === null ? (
                    <T message="Rate unavailable" />
                  ) : (
                    formatMoney(group.convertedAmount, group.convertedCurrency)
                  )}
                </span>
                {group.currency !== group.convertedCurrency ? (
                  <span className="block whitespace-nowrap text-[10px] text-muted-foreground">
                    {formatMoney(group.amount, group.currency)} <T message={" original "} />
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
