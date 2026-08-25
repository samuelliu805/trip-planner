"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
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
  const { t } = useI18n();
  const active = comparison.presentations.find(({ isActive }) => isActive);
  if (!active || comparison.isLoading || comparison.error) return null;
  return (
    <div className="map-bottom-panel mobile-pull-up-panel absolute inset-x-3 bottom-3 z-20 flex flex-col overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-lg backdrop-blur min-[900px]:hidden">
      <PullUpPanelHandle className="sm:hidden" onClose={onClose} />
      <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold">
            {comparison.dayNumber
              ? t("Day {day} routes", { day: comparison.dayNumber })
              : t("Overview comparison")}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            <T message={" Matrix: "} />
            {active.name} <T message={" · Map: read only "} />
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
              <span>
                <T message={"Summary"} />
              </span>
            </Button>
          ) : null}
          <Button
            aria-label={t("Choose visible routes. Showing {visible} of {total}", {
              total: comparison.presentations.length,
              visible: comparison.visiblePresentations.length,
            })}
            className="min-h-11 gap-1 px-2"
            onClick={onChooseRoutes}
            size="sm"
            variant="outline"
          >
            <Eye aria-hidden="true" className="size-4" />
            <span>
              <T message={" Routes "} />
              {comparison.visiblePresentations.length}/{comparison.presentations.length}
            </span>
          </Button>
          <Button
            aria-label="Close comparison panel"
            data-i18n-aria-label={"Close comparison panel"}
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
        <T message={" Showing "} />
        {comparison.visiblePresentations.length} <T message={" of "} />
        {comparison.presentations.length} <T message={" routes. "} />
      </span>
    </div>
  );
}
