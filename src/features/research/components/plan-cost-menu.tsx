"use client";

import { ReceiptText } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PullUpPanel } from "@/components/ui/pull-up-panel";

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
  return (
    <>
      <div className="hidden min-[960px]:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Cost: ${value}. Show breakdown`}
              className="h-11 max-w-11 gap-2 px-2.5 md:max-w-48 md:px-3"
              variant="ghost"
            >
              <ReceiptText aria-hidden="true" className="size-4 shrink-0" />
              <span className="hidden text-xs text-muted-foreground md:inline">Cost</span>
              <span className="hidden truncate text-xs font-semibold tabular-nums md:inline">
                {value}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-[min(30rem,70dvh)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto p-0"
          >
            <div className="border-b px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">Plan cost</p>
              <p className="text-base font-semibold tabular-nums">{value}</p>
            </div>
            <PlanCostBreakdown lines={lines} summary={summary} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button
        aria-label={`Cost: ${value}. Show breakdown`}
        className="h-11 max-w-11 gap-2 px-2.5 min-[960px]:hidden"
        onClick={() => setPanelOpen(true)}
        variant="ghost"
      >
        <ReceiptText aria-hidden="true" className="size-4 shrink-0" />
      </Button>
      <PullUpPanel id="plan-cost" onOpenChange={setPanelOpen} open={panelOpen} title="Plan cost">
        <div className="min-h-0 overflow-y-auto pb-4">
          <p className="border-b px-4 pb-3 text-xl font-semibold tabular-nums">{value}</p>
          <PlanCostBreakdown lines={lines} summary={summary} />
        </div>
      </PullUpPanel>
    </>
  );
}
