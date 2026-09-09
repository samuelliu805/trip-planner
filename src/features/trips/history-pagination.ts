import type { TripHistoryEntry } from "@/platform/contracts/trips";

export const HISTORY_PAGE_SIZE = 10;

export const historyFilterOptions = [
  { label: "All changes", value: "all" },
  { label: "Trip & Plans", value: "plans" },
  { label: "Itinerary", value: "itinerary" },
  { label: "People", value: "people" },
  { label: "Sharing", value: "sharing" },
  { label: "Ideas & Options", value: "ideas" },
] as const;

export type HistoryFilter = (typeof historyFilterOptions)[number]["value"];
export type HistoryCursor = Readonly<{ createdAt: string; id: string }>;
export const historyDetailFilterOptions = [
  { label: "Any field", value: "all" },
  { label: "Actor email or name", value: "email" },
  { label: "Event type", value: "event" },
  { label: "Entity type", value: "entity" },
  { label: "Changed field", value: "changed_field" },
] as const;
export type HistoryDetailFilterField = (typeof historyDetailFilterOptions)[number]["value"];
export type HistoryDetailFilter = Readonly<{ field: HistoryDetailFilterField; value: string }>;

const filterPrefixes: Record<Exclude<HistoryFilter, "all">, string[]> = {
  ideas: ["research.", "research_"],
  itinerary: ["attachment.", "day_route_", "itinerary_item.", "itinerary_items."],
  people: ["member."],
  plans: ["route_variant.", "trip.", "trip_day.", "trip_days."],
  sharing: ["share_page."],
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function historyFilter(value?: string): HistoryFilter {
  return historyFilterOptions.some((option) => option.value === value)
    ? (value as HistoryFilter)
    : "all";
}

export function historyDetailFilter(field?: string, value?: string): HistoryDetailFilter {
  const validField = historyDetailFilterOptions.some((option) => option.value === field)
    ? (field as HistoryDetailFilterField)
    : "all";
  return { field: validField, value: (value ?? "").trim().slice(0, 160) };
}

export function historyEntryMatchesFilter(
  entry: TripHistoryEntry,
  filter: HistoryFilter,
  detail: HistoryDetailFilter = { field: "all", value: "" },
) {
  if (
    filter !== "all" &&
    !filterPrefixes[filter].some((prefix) => entry.eventType.startsWith(prefix))
  )
    return false;
  if (detail.field === "all") return detail.value === "";
  if (!detail.value) return false;
  const expected = detail.value.toLocaleLowerCase();
  if (detail.field === "email") return entry.actorLabel.toLocaleLowerCase() === expected;
  if (detail.field === "event") return entry.eventType.toLocaleLowerCase() === expected;
  if (detail.field === "entity") return entry.entityType.toLocaleLowerCase() === expected;
  return Boolean(
    entry.changes &&
    !Array.isArray(entry.changes) &&
    typeof entry.changes === "object" &&
    Object.keys(entry.changes).some((field) => field.toLocaleLowerCase() === expected),
  );
}

export function parseHistoryCursor(createdAt?: string, id?: string): HistoryCursor | undefined {
  return createdAt && id && Number.isFinite(Date.parse(createdAt)) && uuidPattern.test(id)
    ? { createdAt, id }
    : undefined;
}

export function parseHistoryTrail(value?: string): HistoryCursor[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 50) return [];
    const cursors = parsed.map((entry) =>
      entry && typeof entry === "object"
        ? parseHistoryCursor(String(entry.createdAt ?? ""), String(entry.id ?? ""))
        : undefined,
    );
    return cursors.every(Boolean) ? (cursors as HistoryCursor[]) : [];
  } catch {
    return [];
  }
}

export function historyPageHref({
  cursor,
  detail,
  filter,
  trail,
  tripId,
}: {
  cursor?: HistoryCursor;
  detail: HistoryDetailFilter;
  filter: HistoryFilter;
  trail: HistoryCursor[];
  tripId: string;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (detail.field !== "all") params.set("field", detail.field);
  if (detail.value) params.set("value", detail.value);
  if (cursor) {
    params.set("before", cursor.createdAt);
    params.set("beforeId", cursor.id);
  }
  if (trail.length) params.set("trail", JSON.stringify(trail));
  const query = params.toString();
  return `/trips/${tripId}/history${query ? `?${query}` : ""}`;
}
