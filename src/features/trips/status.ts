/**
 * A trip is either active (`open`) or completed (`done`). The database values stay stable while the
 * product language describes a travel lifecycle instead of a task lifecycle.
 */
export const tripStatuses = ["open", "done"] as const;

export type TripStatus = (typeof tripStatuses)[number];

export const tripStatusFilters = ["open", "done", "all"] as const;

export type TripStatusFilter = (typeof tripStatusFilters)[number];

export const tripStatusFilterLabels: Record<TripStatusFilter, string> = {
  all: "All",
  done: "Completed",
  open: "Active",
};

/** Anything unrecognized — a stale bookmark, a hand-edited URL — falls back to the default view. */
export function resolveTripStatusFilter(value?: string | null): TripStatusFilter {
  return tripStatusFilters.includes(value as TripStatusFilter)
    ? (value as TripStatusFilter)
    : "open";
}

export function tripStatusOf(trip: { status?: string | null }): TripStatus {
  return trip.status === "done" ? "done" : "open";
}

/** The state the menu action moves the trip to, and the words that describe doing it. */
export function tripStatusToggle(status: TripStatus) {
  return status === "done"
    ? { label: "Move to Active", next: "open" as TripStatus }
    : { label: "Mark complete", next: "done" as TripStatus };
}
