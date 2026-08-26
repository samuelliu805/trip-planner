"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";

function Feedback({ comparison }: { comparison: VariantComparisonUi }) {
  return (
    <div className="text-center" role={comparison.error ? "alert" : "status"}>
      {comparison.error ? (
        <AlertTriangle className="mx-auto size-6 text-destructive" />
      ) : (
        <span
          aria-hidden="true"
          className="mx-auto block size-6 animate-spin rounded-full border-2 border-primary border-r-transparent motion-reduce:animate-none"
        />
      )}
      {comparison.error ? (
        <h2 className="mt-3 font-semibold">
          <Localized value="Comparison unavailable" />
        </h2>
      ) : (
        <span className="sr-only">
          <T message="Loading route comparison" />
        </span>
      )}
      {comparison.error ? (
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          <Localized value={comparison.error} />
        </p>
      ) : null}
      {comparison.error ? (
        <Button className="mt-4 min-h-11 gap-2" onClick={comparison.retry} size="sm">
          <RotateCcw className="size-4" /> <T message={" Retry "} />
        </Button>
      ) : null}
    </div>
  );
}

export function VariantComparisonMapStatus({ comparison }: { comparison: VariantComparisonUi }) {
  if (!comparison.isLoading && !comparison.error) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-5">
      <div className="pointer-events-auto max-w-sm rounded-xl border bg-background/95 p-5 shadow-lg backdrop-blur">
        <Feedback comparison={comparison} />
      </div>
    </div>
  );
}

export function VariantComparisonSheetStatus({ comparison }: { comparison: VariantComparisonUi }) {
  if (!comparison.isLoading && !comparison.error) return null;
  return (
    <div
      className={`rounded-lg border p-5 ${comparison.error ? "border-destructive/30 bg-destructive/5" : ""}`}
    >
      <Feedback comparison={comparison} />
    </div>
  );
}
