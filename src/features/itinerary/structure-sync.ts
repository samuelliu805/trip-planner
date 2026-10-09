import { addDays, format, parseISO } from "date-fns";
import type { PlannerWorkspace, PlannerDay, ItineraryItem } from "./types";
import type {
  InsertTripDayInput,
  RemoveTripDayInput,
  ReorderVariantDaysInput,
  CopyItineraryItemsInput,
} from "./day-schema";
import { itemEditableSnapshot } from "./item-editable-snapshot.ts";
import { insertActivityAtPlacement } from "./activity-order.ts";
import { reorderWorkspaceDays } from "./day-order.ts";

export type StructureSyncIntent =
  | { kind: "insertDay"; input: InsertTripDayInput; beforeDays?: string[] }
  | {
      kind: "removeDay";
      input: RemoveTripDayInput;
      beforeDays?: string[];
      beforeDay?: string;
      followsLocal?: boolean;
    }
  | { kind: "reorderDays"; input: ReorderVariantDaysInput; beforeDays?: string[] }
  | {
      kind: "copy";
      input: CopyItineraryItemsInput;
      sources: ItineraryItem[];
      replacements: ItineraryItem[];
      copiedItems: ItineraryItem[];
      sourceParents?: Record<string, string[]>;
    };

export const isStructureIntent = (intent: { kind: string }): intent is StructureSyncIntent =>
  ["insertDay", "removeDay", "reorderDays", "copy"].includes(intent.kind);

export function dayIds(workspace: PlannerWorkspace) {
  return [...workspace.days]
    .sort((a, b) => a.day_number - b.day_number || a.id.localeCompare(b.id))
    .map((day) => day.id);
}

export function dayEditSnapshot(workspace: PlannerWorkspace, dayId: string) {
  const day = workspace.days.find(({ id }) => id === dayId);
  return JSON.stringify(
    day && {
      title: day.title,
      notes: day.notes,
      items: day.items
        .map((item) => ({
          id: item.id,
          fields: itemEditableSnapshot(item),
          order: item.sort_order,
          attachments: item.attachments ?? [],
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      routes: workspace.routePlans.filter((plan) => plan.day_id === dayId),
    },
  );
}

export function createLocalCopies(
  input: CopyItineraryItemsInput,
  sources: ItineraryItem[],
): ItineraryItem[] {
  const now = new Date().toISOString();
  return sources.map((item, index) => {
    const id = input.copiedItemIds![index];
    return {
      ...item,
      id,
      trip_id: input.tripId,
      variant_id: input.variantId,
      day_id: input.targetDayId,
      created_at: now,
      updated_at: now,
      version: 1,
      attachments: [],
      sort_order: index,
      place: input.preservePlace === false ? null : item.place,
      place_id: input.preservePlace === false ? null : item.place_id,
      links: item.links?.map((link, index) => ({
        ...link,
        id: `${id}:link:${index}`,
        item_id: id,
      })),
    };
  });
}

function positionedDays(days: PlannerDay[], startDate: string | null): PlannerDay[] {
  return days.map((day, index) => ({
    ...day,
    day_number: index + 1,
    date: startDate ? format(addDays(parseISO(startDate), index), "yyyy-MM-dd") : null,
  }));
}

export function projectStructureIntent(
  workspace: PlannerWorkspace,
  intent: StructureSyncIntent,
): PlannerWorkspace {
  const days = [...workspace.days].sort(
    (a, b) => a.day_number - b.day_number || a.id.localeCompare(b.id),
  );
  if (intent.kind === "reorderDays")
    return reorderWorkspaceDays(workspace, intent.input.orderedDayIds)!;
  if (intent.kind === "copy")
    return {
      ...workspace,
      days: days.map((day) =>
        day.id === intent.input.targetDayId
          ? {
              ...day,
              items: intent.copiedItems.reduce(
                (items, item) => insertActivityAtPlacement(items, item),
                day.items.filter((item) => !intent.input.replaceTargetItemIds?.includes(item.id)),
              ),
            }
          : day,
      ),
    };
  const complete = days.every((day) => day.date !== null);
  let startDate = complete ? (days[0]?.date ?? null) : null;
  if (intent.kind === "insertDay") {
    if (days.some((day) => day.id === intent.input.operationId)) return workspace;
    if (startDate && intent.input.beforeDayNumber === 1)
      startDate = format(addDays(parseISO(startDate), -1), "yyyy-MM-dd");
    days.splice(intent.input.beforeDayNumber - 1, 0, {
      id: intent.input.operationId,
      variant_id: intent.input.variantId,
      day_number: intent.input.beforeDayNumber,
      date: null,
      title: null,
      notes: null,
      content_version: 1,
      version: 1,
      items_version: 1,
      items: [],
    });
  } else {
    if (days.length <= 1) return workspace;
    const index = days.findIndex((day) => day.id === intent.input.dayId);
    if (index < 0) return workspace;
    if (index === 0 && startDate) startDate = format(addDays(parseISO(startDate), 1), "yyyy-MM-dd");
    days.splice(index, 1);
  }
  return {
    ...workspace,
    days: positionedDays(days, startDate),
    routePlans: workspace.routePlans.filter((plan) => days.some((day) => day.id === plan.day_id)),
  };
}
