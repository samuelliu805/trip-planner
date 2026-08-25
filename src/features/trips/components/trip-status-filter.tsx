"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  tripStatusFilterLabels,
  tripStatusFilters,
  type TripStatusFilter,
} from "@/features/trips/status";

type TripListLoadingSetter = (message?: string) => void;
const TripListLoadingContext = createContext<TripListLoadingSetter>(() => undefined);

export function useTripListLoading() {
  return useContext(TripListLoadingContext);
}

export function tripStatusFilterHref(filter: TripStatusFilter) {
  return filter === "open" ? "/trips" : `/trips?status=${filter}`;
}

export function TripStatusFilterTabs({
  active,
  action,
  children,
}: {
  active: TripStatusFilter;
  action: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendingFilter, setPendingFilter] = useState<TripStatusFilter | null>(null);
  const [operationLabel, setOperationLabel] = useState<string>();
  const [pending, startFilterChange] = useTransition();
  const displayedActive = pending && pendingFilter ? pendingFilter : active;
  const loading = pending || Boolean(operationLabel);
  const setListLoading = useCallback((message?: string) => setOperationLabel(message), []);
  const { t } = useI18n();

  function selectFilter(filter: TripStatusFilter) {
    if (filter === displayedActive) return;
    setPendingFilter(filter);
    startFilterChange(() => {
      router.replace(tripStatusFilterHref(filter), { scroll: false });
    });
  }

  return (
    <TripListLoadingContext.Provider value={setListLoading}>
      <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-3">
        <nav
          aria-label="Filter trips by status"
          data-i18n-aria-label={"Filter trips by status"}
          className="relative z-10 flex min-w-0 flex-1 gap-0.5 rounded-lg bg-muted/30 p-0.5 sm:flex-none sm:gap-1 sm:p-1"
        >
          {tripStatusFilters.map((filter) => (
            <button
              aria-controls="trip-list"
              aria-pressed={filter === displayedActive}
              className={`flex min-h-11 min-w-0 flex-1 touch-manipulation select-none items-center justify-center rounded-md px-1.5 py-2 text-xs font-medium transition-colors sm:min-w-16 sm:flex-none sm:px-3 sm:text-sm ${
                filter === displayedActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              key={filter}
              disabled={Boolean(operationLabel)}
              onClick={() => selectFilter(filter)}
              type="button"
            >
              <Localized value={tripStatusFilterLabels[filter]} />
            </button>
          ))}
        </nav>
        <div className="min-w-0 shrink-0">{action}</div>
      </div>

      <div className="relative mt-6 min-h-52">
        <section
          aria-busy={loading}
          aria-labelledby="trip-list-title"
          className={loading ? "pointer-events-none invisible" : undefined}
          id="trip-list"
        >
          {children}
        </section>
        {loading ? (
          <div
            aria-live="polite"
            className="absolute inset-0 flex min-h-52 items-center justify-center rounded-xl border bg-card"
            role="status"
          >
            <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              {operationLabel ? (
                <Localized value={operationLabel} />
              ) : (
                t("Loading {status} trips…", {
                  status: t(tripStatusFilterLabels[displayedActive]),
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </TripListLoadingContext.Provider>
  );
}
