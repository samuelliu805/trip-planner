"use client";

import { ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Cost: ${value}. Show breakdown`}
          className="h-11 max-w-32 gap-2 px-2.5 sm:max-w-48 sm:px-3"
          variant="ghost"
        >
          <ReceiptText aria-hidden="true" className="size-4 shrink-0" />
          <span className="hidden text-xs text-muted-foreground sm:inline">Cost</span>
          <span className="truncate text-xs font-semibold tabular-nums">{value}</span>
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
  );
}
