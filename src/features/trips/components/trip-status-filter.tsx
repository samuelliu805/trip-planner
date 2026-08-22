"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import {
  tripStatusFilterLabels,
  tripStatusFilters,
  type TripStatusFilter,
} from "@/features/trips/status";

export function tripStatusFilterHref(filter: TripStatusFilter) {
  return filter === "open" ? "/trips" : `/trips?status=${filter}`;
}

export function TripStatusFilterTabs({
  active,
  children,
}: {
  active: TripStatusFilter;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendingFilter, setPendingFilter] = useState<TripStatusFilter | null>(null);
  const [pending, startFilterChange] = useTransition();
  const displayedActive = pending && pendingFilter ? pendingFilter : active;

  function selectFilter(filter: TripStatusFilter) {
    if (filter === displayedActive) return;
    setPendingFilter(filter);
    startFilterChange(() => {
      router.replace(tripStatusFilterHref(filter), { scroll: false });
    });
  }

  return (
    <>
      <nav
        aria-label="Filter trips by status"
        className="relative z-10 flex w-fit min-w-0 shrink-0 gap-1 rounded-lg border bg-muted/40 p-1"
      >
        {tripStatusFilters.map((filter) => (
          <button
            aria-controls="trip-list"
            aria-pressed={filter === displayedActive}
            className={`flex min-h-11 min-w-16 touch-manipulation select-none items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              filter === displayedActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            key={filter}
            onClick={() => selectFilter(filter)}
            type="button"
          >
            {tripStatusFilterLabels[filter]}
          </button>
        ))}
      </nav>

      <div className="relative mt-6 min-h-52">
        <section
          aria-busy={pending}
          aria-labelledby="trip-list-title"
          className={pending ? "pointer-events-none invisible" : undefined}
          id="trip-list"
        >
          {children}
        </section>
        {pending ? (
          <div
            aria-live="polite"
            className="absolute inset-0 flex min-h-52 items-center justify-center rounded-xl border bg-card"
            role="status"
          >
            <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              Loading {tripStatusFilterLabels[displayedActive]} trips…
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
