"use client";

import { CircleDollarSign } from "lucide-react";

import { Localized, T } from "@/features/i18n/i18n-provider";
import {
  costSummaryText,
  PlanCostBreakdown,
} from "@/features/research/components/plan-cost-breakdown";
import { DecisionSummaryDisclosureSummary } from "@/features/variants/components/decision-summary-card-elements";
import type { ConvertedPlanCostLine, PlanCostSummary } from "@/features/research/types";

export function DecisionSummaryCostDetails({
  lines,
  summary,
}: {
  lines: ConvertedPlanCostLine[];
  summary: PlanCostSummary;
}) {
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
        <PlanCostBreakdown lines={lines} summary={summary} />
      </div>
    </details>
  );
}
