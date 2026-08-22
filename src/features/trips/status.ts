export const tripStatuses = ["open", "done"] as const;

export type TripStatus = (typeof tripStatuses)[number];

export const tripStatusFilters = ["open", "done", "all"] as const;

export type TripStatusFilter = (typeof tripStatusFilters)[number];

export const tripStatusFilterLabels: Record<TripStatusFilter, string> = {
  all: "All",
  done: "Completed",
  open: "Active",
};

export function resolveTripStatusFilter(value?: string | null): TripStatusFilter {
  return tripStatusFilters.includes(value as TripStatusFilter)
    ? (value as TripStatusFilter)
    : "open";
}

export function tripStatusOf(trip: { status?: string | null }): TripStatus {
  return trip.status === "done" ? "done" : "open";
}

export function tripStatusToggle(status: TripStatus) {
  return status === "done"
    ? { label: "Move to Active", next: "open" as TripStatus }
    : { label: "Mark complete", next: "done" as TripStatus };
}
