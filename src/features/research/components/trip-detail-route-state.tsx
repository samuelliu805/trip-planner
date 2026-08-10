"use client";

import { Button } from "@/components/ui/button";

export function TripDetailRouteState({
  description,
  onRetry,
  title,
}: {
  description: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <main className="trip-detail-page flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col overflow-hidden sm:h-[calc(100dvh-4rem)]">
      <div
        aria-hidden="true"
        className="trip-section-nav flex h-11 shrink-0 items-center gap-2 border-b bg-background/95 px-2"
      >
        <div className="h-2 w-12 animate-pulse rounded bg-muted" />
        <div className="h-2 w-28 animate-pulse rounded bg-muted" />
      </div>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="trip-detail-scroller min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
            <h1 className="font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            {onRetry ? (
              <Button className="mt-4 min-h-11" onClick={onRetry}>
                Try again
              </Button>
            ) : (
              <div className="mt-4 h-2 w-32 animate-pulse rounded bg-muted" role="status">
                <span className="sr-only">Loading trip section</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
