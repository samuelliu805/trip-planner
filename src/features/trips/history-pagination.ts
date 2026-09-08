import type { TripHistoryEntry, TripHistoryPage } from "@/platform/contracts/trips";

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

export function historyEntryMatchesFilter(entry: TripHistoryEntry, filter: HistoryFilter) {
  return (
    filter === "all" || filterPrefixes[filter].some((prefix) => entry.eventType.startsWith(prefix))
  );
}

export async function loadFilteredHistoryPage(
  loadPage: (cursor?: HistoryCursor) => Promise<TripHistoryPage>,
  cursor: HistoryCursor | undefined,
  filter: HistoryFilter,
  pageSize = 20,
): Promise<TripHistoryPage> {
  const matches: TripHistoryEntry[] = [];
  const visited = new Set<string>();
  let scanCursor = cursor;

  while (matches.length <= pageSize) {
    const page = await loadPage(scanCursor);
    for (const entry of page.entries) {
      if (historyEntryMatchesFilter(entry, filter)) matches.push(entry);
      if (matches.length > pageSize) break;
    }
    if (matches.length > pageSize || !page.nextCursor) break;
    const key = `${page.nextCursor.createdAt}:${page.nextCursor.id}`;
    if (visited.has(key)) throw new Error("Trip history pagination did not advance.");
    visited.add(key);
    scanCursor = page.nextCursor;
  }

  const entries = matches.slice(0, pageSize);
  const last = entries.at(-1);
  return {
    entries,
    nextCursor:
      matches.length > pageSize && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
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
  filter,
  trail,
  tripId,
}: {
  cursor?: HistoryCursor;
  filter: HistoryFilter;
  trail: HistoryCursor[];
  tripId: string;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (cursor) {
    params.set("before", cursor.createdAt);
    params.set("beforeId", cursor.id);
  }
  if (trail.length) params.set("trail", JSON.stringify(trail));
  const query = params.toString();
  return `/trips/${tripId}/history${query ? `?${query}` : ""}`;
}
