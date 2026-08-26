"use client";

import { useEffect, useState } from "react";

import { PullUpPanel } from "@/components/ui/pull-up-panel";
import { Localized } from "@/features/i18n/i18n-provider";
import { OPEN_PLAN_COST_EVENT } from "@/features/research/events";

import { costSummaryText, PlanCostBreakdown } from "./plan-cost-breakdown";
import type { ConvertedPlanCostLine, PlanCostSummary } from "../types";

export function PlanCostMenu({
  lines,
  summary,
}: {
  lines: ConvertedPlanCostLine[];
  summary: PlanCostSummary;
}) {
  const value = costSummaryText(summary);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const openPanel = () => setPanelOpen(true);
    window.addEventListener(OPEN_PLAN_COST_EVENT, openPanel);
    return () => window.removeEventListener(OPEN_PLAN_COST_EVENT, openPanel);
  }, []);

  return (
    <PullUpPanel id="plan-cost" onOpenChange={setPanelOpen} open={panelOpen} title="Plan cost">
      <div className="min-h-0 overflow-y-auto pb-4">
        <p className="border-b px-4 pb-3 text-xl font-semibold tabular-nums">
          <Localized value={value} />
        </p>
        <PlanCostBreakdown lines={lines} summary={summary} />
      </div>
    </PullUpPanel>
  );
}
