"use client";

import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { VariantComparisonRows } from "@/features/variants/components/variant-comparison-rows";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";

export function RouteVariantComparisonPanel({
  comparison,
  onSummaryOpen,
  summaryOpen,
}: {
  comparison: VariantComparisonUi;
  onSummaryOpen: () => void;
  summaryOpen: boolean;
}) {
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false);
  const collapsed = manuallyCollapsed || summaryOpen;
  if (comparison.isLoading || comparison.error) return null;
  return (
    <aside
      aria-label="Route variant comparison legend"
      className="absolute right-3 top-16 z-20 hidden w-[min(21rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border bg-background/95 shadow-xl backdrop-blur min-[900px]:block"
    >
      <div
        className={`flex min-h-11 items-center justify-between px-3 py-2 ${collapsed ? "" : "border-b"}`}
      >
        <div>
          <h2 className="text-sm font-semibold">
            {comparison.dayNumber ? `Day ${comparison.dayNumber} routes` : "Overview comparison"}
          </h2>
          {!collapsed ? (
            <p className="text-[11px] text-muted-foreground">
              {comparison.dayNumber
                ? "Solid lines are saved routes; dashed lines preview stop order."
                : "Dashed lines show city/town order—not driving directions."}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {summaryOpen ? (
            <span className="px-2 text-xs font-medium text-muted-foreground">Summary open</span>
          ) : (
            <button
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Show comparison legend" : "Hide comparison legend"}
              className="flex min-h-9 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setManuallyCollapsed((current) => !current)}
              title={collapsed ? "Show legend" : "Hide legend"}
              type="button"
            >
              {collapsed ? (
                <ChevronDown aria-hidden="true" className="size-4" />
              ) : (
                <ChevronUp aria-hidden="true" className="size-4" />
              )}
              {collapsed ? "Show" : "Hide"}
            </button>
          )}
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="max-h-[min(25rem,calc(100dvh-10rem))] space-y-1 overflow-y-auto p-2">
            <VariantComparisonRows comparison={comparison} />
          </div>
          {!comparison.dayNumber ? (
            <div className="border-t p-2">
              <button
                aria-expanded={summaryOpen}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onSummaryOpen}
                type="button"
              >
                <BarChart3 aria-hidden="true" className="size-4" />
                {summaryOpen ? "Summary open" : "Decision summary"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
