"use client";

import { BarChart3, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";

export function VariantComparisonMobileBar({
  comparison,
  onChooseRoutes,
  onSummaryOpen,
}: {
  comparison: VariantComparisonUi;
  onChooseRoutes: () => void;
  onSummaryOpen: () => void;
}) {
  const active = comparison.presentations.find(({ isActive }) => isActive);
  if (!active || comparison.isLoading || comparison.error) return null;
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 flex min-h-14 items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur min-[900px]:hidden">
      <div className="min-w-0">
        <h2 className="text-xs font-semibold">
          {comparison.dayNumber ? `Day ${comparison.dayNumber} routes` : "Overview comparison"}
        </h2>
        <p className="truncate text-[11px] text-muted-foreground">
          Matrix: {active.name} · Map: read only
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {!comparison.dayNumber ? (
          <Button
            className="min-h-11 gap-1 px-2"
            onClick={onSummaryOpen}
            size="sm"
            variant="outline"
          >
            <BarChart3 aria-hidden="true" className="size-4" />
            <span>Summary</span>
          </Button>
        ) : null}
        <Button
          aria-label={
            "Choose visible routes. Showing " +
            comparison.visiblePresentations.length +
            " of " +
            comparison.presentations.length
          }
          className="min-h-11 gap-1 px-2"
          onClick={onChooseRoutes}
          size="sm"
          variant="outline"
        >
          <Eye aria-hidden="true" className="size-4" />
          <span>
            Routes {comparison.visiblePresentations.length}/{comparison.presentations.length}
          </span>
        </Button>
      </div>
      <span aria-live="polite" className="sr-only" role="status">
        Showing {comparison.visiblePresentations.length} of {comparison.presentations.length}{" "}
        routes.
      </span>
    </div>
  );
}
