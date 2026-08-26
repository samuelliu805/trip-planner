"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
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
  const { t } = useI18n();
  if (comparison.isLoading || comparison.error || summaryOpen) return null;
  return (
    <aside
      aria-label="Route variant comparison legend"
      data-i18n-aria-label="Route variant comparison legend"
      className="map-bottom-panel absolute bottom-3 left-3 right-3 z-20 hidden max-h-[min(34rem,calc(100dvh-7rem))] overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-xl backdrop-blur min-[900px]:flex min-[900px]:flex-col"
    >
      <div className="flex min-h-11 items-center justify-between border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">
            {comparison.dayNumber
              ? t("Day {day} routes", { day: comparison.dayNumber })
              : t("Overview comparison")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            <Localized
              value={
                comparison.dayNumber
                  ? "Solid lines are saved routes; dashed lines preview stop order."
                  : "Dashed lines show city/town order—not driving directions."
              }
            />
          </p>
        </div>
        <button
          aria-label="Close comparison panel"
          data-i18n-aria-label={"Close comparison panel"}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
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
            <T message={" Decision summary "} />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
