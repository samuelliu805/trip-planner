"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
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
    <main className="trip-detail-page flex h-dvh min-w-0 flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="trip-app-bar flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-2 sm:h-16"
      >
        <div className="size-9 animate-pulse rounded bg-muted" />
        <div className="h-2 w-32 animate-pulse rounded bg-muted" />
      </div>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="trip-detail-scroller min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-6">
            <div aria-hidden="true" className="flex min-h-11 items-center gap-2">
              <div className="h-11 w-28 animate-pulse rounded-lg bg-muted" />
              <div className="ml-auto size-11 animate-pulse rounded-lg bg-muted" />
              <div className="size-11 animate-pulse rounded-lg bg-muted" />
            </div>
            <div>
              <h1 className="font-semibold">
                <Localized value={title} />
              </h1>
              {onRetry ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  <Localized value={description} />
                </p>
              ) : null}
              {onRetry ? (
                <Button className="mt-4 min-h-11" onClick={onRetry}>
                  <T message={" Try again "} />
                </Button>
              ) : (
                <div className="mt-4 h-2 w-32 animate-pulse rounded bg-muted" role="status">
                  <span className="sr-only">
                    <T message={"Loading trip section"} />
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
