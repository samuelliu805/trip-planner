import { mergeAttachmentCollection } from "../attachments/merge-attachment-collection.ts";
import type { PlannerSyncDelta, PlannerWorkspace } from "./types.ts";

export function mergeConfirmedWorkspace(
  current: PlannerWorkspace,
  incoming: PlannerWorkspace,
): PlannerWorkspace {
  const structure =
    incoming.variant.days_version >= current.variant.days_version ? incoming : current;
  const metadata =
    incoming.variant.version >= current.variant.version ? incoming.variant : current.variant;
  const routeSource =
    incoming.variant.content_version >= current.variant.content_version ? incoming : current;
  return {
    ...structure,
    variant: {
      ...metadata,
      days_version: Math.max(incoming.variant.days_version, current.variant.days_version),
      items_version: Math.max(incoming.variant.items_version, current.variant.items_version),
      content_version: Math.max(incoming.variant.content_version, current.variant.content_version),
    },
    routePlans: routeSource.routePlans.map((plan) => {
      const before = current.routePlans.find((row) => row.id === plan.id);
      const next = incoming.routePlans.find((row) => row.id === plan.id);
      if (!before || !next) return plan;
      if (before.version !== next.version) return before.version > next.version ? before : next;
      return (before.calculation?.version ?? 0) > (next.calculation?.version ?? 0) ? before : next;
    }),
    days: structure.days.map((day) => {
      const before = current.days.find(({ id }) => id === day.id);
      const next = incoming.days.find(({ id }) => id === day.id);
      if (!before) return next ?? day;
      if (!next) return before;
      const row =
        next.content_version >= before.content_version && next.items_version >= before.items_version
          ? next
          : before;
      const items = next.items_version >= before.items_version ? next.items : before.items;
      return {
        ...row,
        items: items.map((item) => {
          const previous = before.items.find((old) => old.id === item.id),
            latest = next.items.find((incoming) => incoming.id === item.id);
          if (!previous || !latest) return item;
          const text = latest.version >= previous.version ? latest : previous;
          return mergeAttachmentCollection(previous, {
            ...text,
            attachments: latest.attachments,
            attachments_version: latest.attachments_version,
          });
        }),
      };
    }),
  };
}

export function applyConfirmedDelta(
  current: PlannerWorkspace,
  delta: PlannerSyncDelta | PlannerWorkspace,
): PlannerWorkspace {
  if (!("workspace" in delta)) return mergeConfirmedWorkspace(current, delta);
  if (delta.full) return mergeConfirmedWorkspace(current, delta.workspace);
  const incoming = delta.workspace;
  const ids = new Set(incoming.days.map(({ id }) => id));
  const merged = mergeConfirmedWorkspace(current, {
    ...incoming,
    // A day delta cannot restore/delete structure or unrelated days.
    variant: { ...incoming.variant, days_version: current.variant.days_version },
    days: current.days.map((day) => incoming.days.find(({ id }) => id === day.id) ?? day),
    routePlans: [
      ...current.routePlans.filter(({ day_id }) => !ids.has(day_id)),
      ...incoming.routePlans,
    ],
  });
  return { ...merged, variant: { ...merged.variant, days_version: current.variant.days_version } };
}
