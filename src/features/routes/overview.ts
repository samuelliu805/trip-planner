import type { PlannerDay } from "@/features/itinerary/types";

export type OverviewStageEntry = {
  dayLabel: string;
  dayNumber: number;
  itemId: string;
  title: string;
};

export type OverviewStage = {
  address?: string;
  dayRangeLabel: string;
  entries: OverviewStageEntry[];
  id: string;
  latitude: number;
  longitude: number;
  placeId: string;
  position: number;
};

function rangeLabel(entries: OverviewStageEntry[]) {
  const days = [...new Set(entries.map(({ dayNumber }) => dayNumber))].sort((a, b) => a - b);
  if (days.length === 1) return `Day ${days[0]}`;
  return `Days ${days[0]}–${days.at(-1)}`;
}

/**
 * Builds the lightweight trip overview from explicit City rows only. Missing days
 * are intentionally ignored; no place or intermediate stage is inferred.
 */
export function deriveOverviewStages(days: PlannerDay[]): OverviewStage[] {
  const cityEntries = [...days]
    .sort((a, b) => a.day_number - b.day_number)
    .flatMap((day) =>
      [...day.items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((item) => item.type === "location" && item.place)
        .map((item) => ({
          address: item.place?.formattedAddress,
          dayLabel: `Day ${day.day_number}`,
          dayNumber: day.day_number,
          itemId: item.id,
          latitude: item.place!.latitude,
          longitude: item.place!.longitude,
          placeId: item.place!.id,
          title: item.title,
        })),
    );

  const stages: OverviewStage[] = [];
  for (const entry of cityEntries) {
    const previous = stages.at(-1);
    if (previous?.placeId === entry.placeId) {
      previous.entries.push(entry);
      previous.dayRangeLabel = rangeLabel(previous.entries);
      continue;
    }
    const entries = [entry];
    stages.push({
      address: entry.address,
      dayRangeLabel: rangeLabel(entries),
      entries,
      id: `overview:${stages.length + 1}:${entry.placeId}`,
      latitude: entry.latitude,
      longitude: entry.longitude,
      placeId: entry.placeId,
      position: stages.length + 1,
    });
  }
  return stages;
}
