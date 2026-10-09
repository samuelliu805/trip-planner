import { mergeAttachmentCollection } from "../attachments/merge-attachment-collection.ts";
import type { PlannerWorkspace } from "../itinerary/types";
import type { ApplicationProjection } from "./application-projection";

export function projectApplication(
  workspace: PlannerWorkspace,
  projection: ApplicationProjection,
): PlannerWorkspace {
  const items = new Set(projection.items.map((item) => item.id));
  const removed = new Set(projection.removedIds);
  const applyStructure =
    !projection.confirmed ||
    projection.baseDaysVersion === undefined ||
    workspace.variant.days_version <= projection.baseDaysVersion;
  return {
    ...workspace,
    days: [
      ...workspace.days,
      ...(applyStructure
        ? projection.days.filter((day) => !workspace.days.some((old) => old.id === day.id))
        : []),
    ]
      .filter((day) => !applyStructure || !projection.removedDayIds?.includes(day.id))
      .map((day) => {
        const snapshot = projection.days.find((row) => row.id === day.id);
        const metadata =
          applyStructure && (!projection.confirmed || (snapshot?.version ?? 0) >= day.version)
            ? snapshot
            : undefined;
        const applyItems =
          !projection.confirmed ||
          !snapshot ||
          !workspace.days.some((row) => row.id === day.id) ||
          day.items_version < snapshot.items_version;
        return {
          ...day,
          day_number: metadata?.day_number ?? day.day_number,
          date: metadata?.date ?? day.date,
          items: !applyItems
            ? day.items
            : [
                ...day.items.filter((item) => !items.has(item.id) && !removed.has(item.id)),
                ...projection.items
                  .filter((item) => item.day_id === day.id)
                  .map((item) => {
                    const current = day.items.find((row) => row.id === item.id);
                    if (!projection.confirmed || !current) return item;
                    if (current.version > item.version) return current;
                    return mergeAttachmentCollection(current, {
                      ...item,
                      place:
                        item.place === undefined
                          ? item.place_id === current.place_id
                            ? current.place
                            : null
                          : item.place,
                      attachments:
                        item.attachments ??
                        ((item.attachments_version ?? 0) <= (current.attachments_version ?? 0)
                          ? current.attachments
                          : undefined),
                    });
                  }),
              ],
        };
      }),
  };
}
