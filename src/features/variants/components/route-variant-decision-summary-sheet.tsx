"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DecisionSummaryCard } from "@/features/variants/components/decision-summary-card";
import { DecisionSummaryFeedback } from "@/features/variants/components/decision-summary-feedback";
import { decisionSummaryMetricVisibility } from "@/features/variants/decision-summary-presentation";
import type { VariantDecisionSummaryUi } from "@/features/variants/use-variant-decision-summary";

export function RouteVariantDecisionSummarySheet({
  activeVariantId,
  onOpenChange,
  open,
  summary,
}: {
  activeVariantId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  summary: VariantDecisionSummaryUi;
}) {
  const visibility = decisionSummaryMetricVisibility(summary.summaries);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="z-[120] max-h-[88dvh]" overlayClassName="z-[115]" side="bottom">
        <SheetHeader className="py-4">
          <SheetTitle>Decision summary</SheetTitle>
          <SheetDescription>
            Saved facts for up to three routes. Primary is the baseline; differences are neutral.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          {summary.isLoading || summary.error ? (
            <DecisionSummaryFeedback summary={summary} />
          ) : (
            summary.summaries
              .slice(0, 3)
              .map((variantSummary) => (
                <DecisionSummaryCard
                  activeVariantId={activeVariantId}
                  key={variantSummary.variantId}
                  summary={variantSummary}
                  visibility={visibility}
                />
              ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
