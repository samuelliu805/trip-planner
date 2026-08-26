"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VariantDecisionSummaryUi } from "@/features/variants/use-variant-decision-summary";

export function DecisionSummaryFeedback({ summary }: { summary: VariantDecisionSummaryUi }) {
  return (
    <div className="rounded-lg border p-5 text-center" role={summary.error ? "alert" : "status"}>
      {summary.error ? (
        <AlertTriangle aria-hidden="true" className="mx-auto size-6 text-destructive" />
      ) : (
        <span
          aria-hidden="true"
          className="mx-auto block size-6 animate-spin rounded-full border-2 border-primary border-r-transparent motion-reduce:animate-none"
        />
      )}
      {summary.error ? (
        <h3 className="mt-3 text-sm font-semibold">
          <Localized value="Comparison summary unavailable" />
        </h3>
      ) : (
        <span className="sr-only">
          <T message="Loading comparison summary" />
        </span>
      )}
      {summary.error ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          <Localized value={summary.error} />
        </p>
      ) : null}
      {summary.error ? (
        <Button className="mt-4 min-h-11 gap-2" onClick={summary.retry} size="sm">
          <RotateCcw aria-hidden="true" className="size-4" /> <T message={" Retry summary "} />
        </Button>
      ) : null}
    </div>
  );
}
