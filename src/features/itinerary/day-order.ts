import type { PlannerDay, PlannerWorkspace } from "@/features/itinerary/types";

export function placeDayAtGap(dayIds: string[], movingDayId: string, gapIndex: number) {
  if (!dayIds.includes(movingDayId)) return dayIds;
  const remaining = dayIds.filter((id) => id !== movingDayId);
  const insertion = Math.max(0, Math.min(gapIndex, remaining.length));
  const reordered = [...remaining];
  reordered.splice(insertion, 0, movingDayId);
  return reordered;
}

export function isSameDayOrder(first: string[], second: string[]) {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

export function reorderWorkspaceDays(
  workspace: PlannerWorkspace | undefined,
  orderedDayIds: string[],
) {
  if (!workspace) return workspace;
  const dayById = new Map(workspace.days.map((day) => [day.id, day]));
  if (
    orderedDayIds.length !== workspace.days.length ||
    new Set(orderedDayIds).size !== workspace.days.length ||
    orderedDayIds.some((id) => !dayById.has(id))
  )
    return workspace;

  const orderedOriginal = [...workspace.days].sort(
    (a, b) => a.day_number - b.day_number || a.id.localeCompare(b.id),
  );
  const completeDates = orderedOriginal.every((day) => day.date !== null);
  const positionDates = orderedOriginal.map(({ date }) => date);
  const days = orderedDayIds.map((id, index): PlannerDay => ({
    ...dayById.get(id)!,
    day_number: index + 1,
    ...(completeDates && { date: positionDates[index] }),
  }));
  return { ...workspace, days };
}
