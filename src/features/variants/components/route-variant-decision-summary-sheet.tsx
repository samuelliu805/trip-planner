"use client";

import { PullUpPanel } from "@/components/ui/pull-up-panel";
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
    <PullUpPanel
      className="z-[120] max-h-[68dvh]"
      dragMode="mobile"
      id="route-decision-summary"
      onOpenChange={onOpenChange}
      open={open}
      overlayClassName="z-[115]"
      title="Decision summary"
    >
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4">
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
    </PullUpPanel>
  );
}
