"use client";

import { BarChart3, X } from "lucide-react";

import { VariantComparisonRows } from "@/features/variants/components/variant-comparison-rows";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";

export function RouteVariantComparisonPanel({
  comparison,
  onClose,
  onSummaryOpen,
  summaryOpen,
}: {
  comparison: VariantComparisonUi;
  onClose: () => void;
  onSummaryOpen: () => void;
  summaryOpen: boolean;
}) {
  if (comparison.isLoading || comparison.error || summaryOpen) return null;
  return (
    <aside
      aria-label="Route variant comparison legend"
      className="absolute bottom-3 left-3 z-20 hidden w-[min(21rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border bg-background/95 shadow-xl backdrop-blur min-[900px]:block"
    >
      <div className="flex min-h-11 items-center justify-between border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">
            {comparison.dayNumber ? `Day ${comparison.dayNumber} routes` : "Overview comparison"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {comparison.dayNumber
              ? "Solid lines are saved routes; dashed lines preview stop order."
              : "Dashed lines show city/town order—not driving directions."}
          </p>
        </div>
        <button
          aria-label="Close comparison panel"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
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
            Decision summary
          </button>
        </div>
      ) : null}
    </aside>
  );
}
