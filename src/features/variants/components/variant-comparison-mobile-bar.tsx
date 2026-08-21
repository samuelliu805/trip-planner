"use client";

import { BarChart3, Eye, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PullUpPanelHandle } from "@/components/ui/pull-up-panel";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";

export function VariantComparisonMobileBar({
  comparison,
  onChooseRoutes,
  onClose,
  onSummaryOpen,
}: {
  comparison: VariantComparisonUi;
  onChooseRoutes: () => void;
  onClose: () => void;
  onSummaryOpen: () => void;
}) {
  const active = comparison.presentations.find(({ isActive }) => isActive);
  if (!active || comparison.isLoading || comparison.error) return null;
  return (
    <div className="map-bottom-panel mobile-pull-up-panel absolute inset-x-3 bottom-3 z-20 flex flex-col overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-lg backdrop-blur min-[900px]:hidden">
      <PullUpPanelHandle className="sm:hidden" onClose={onClose} />
      <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
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
          <Button
            aria-label="Close comparison panel"
            className="size-11 p-0"
            onClick={onClose}
            size="sm"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
      <span aria-live="polite" className="sr-only" role="status">
        Showing {comparison.visiblePresentations.length} of {comparison.presentations.length}{" "}
        routes.
      </span>
    </div>
  );
}
