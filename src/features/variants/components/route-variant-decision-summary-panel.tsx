"use client";

import { T } from "@/features/i18n/i18n-provider";
import { X } from "lucide-react";

import { DecisionSummaryCard } from "@/features/variants/components/decision-summary-card";
import { DecisionSummaryFeedback } from "@/features/variants/components/decision-summary-feedback";
import { decisionSummaryMetricVisibility } from "@/features/variants/decision-summary-presentation";
import type { VariantDecisionSummaryUi } from "@/features/variants/use-variant-decision-summary";

export function RouteVariantDecisionSummaryPanel({
  activeVariantId,
  onCollapse,
  open,
  summary,
}: {
  activeVariantId: string;
  onCollapse: () => void;
  open: boolean;
  summary: VariantDecisionSummaryUi;
}) {
  if (!open) return null;
  const visibility = decisionSummaryMetricVisibility(summary.summaries);
  return (
    <aside
      aria-label="Route variant decision summary"
      data-i18n-aria-label="Route variant decision summary"
      className="map-bottom-panel absolute inset-x-3 bottom-3 z-30 hidden max-h-[min(34rem,calc(100dvh-7rem))] overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-2xl backdrop-blur min-[900px]:flex min-[900px]:flex-col"
    >
      <header className="flex min-h-11 items-center justify-between gap-4 border-b px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            <T message={"Decision summary"} />
          </h2>
        </div>
        <button
          aria-label="Close decision summary"
          data-i18n-aria-label={"Close decision summary"}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onCollapse}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
        {summary.isLoading || summary.error ? (
          <DecisionSummaryFeedback summary={summary} />
        ) : (
          <div className="grid auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1">
            {summary.summaries.slice(0, 3).map((variantSummary) => (
              <DecisionSummaryCard
                activeVariantId={activeVariantId}
                key={variantSummary.variantId}
                summary={variantSummary}
                visibility={visibility}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
