import type { PlannerWorkspace, PlannerVariant } from "../itinerary/types";
import { itemEditableSnapshot } from "../itinerary/item-editable-snapshot.ts";

export const variantFields = (variant: PlannerVariant) =>
  JSON.stringify([variant.name, variant.color]);
export const sourceSnapshot = (workspace: PlannerWorkspace) =>
  JSON.stringify([
    variantFields(workspace.variant),
    [...workspace.days]
      .sort((a, b) => a.day_number - b.day_number || a.id.localeCompare(b.id))
      .map((day) => [
        day.id,
        day.day_number,
        day.date,
        day.title,
        day.notes,
        [...day.items]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((item) => [item.id, itemEditableSnapshot(item), item.sort_order]),
      ]),
    [...workspace.routePlans]
      .sort((a, b) => a.day_id.localeCompare(b.day_id))
      .map((plan) => [
        plan.day_id,
        plan.stops.map((stop) => stop.item_id),
        plan.legs.map((leg) => leg.mode),
      ]),
  ]);

/** Fixed field labels only: never include source values, IDs, or arbitrary JSON keys. */
export function sourceSnapshotDifferences(before: PlannerWorkspace, after: PlannerWorkspace) {
  const changes = new Set<string>();
  const compare = (label: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.add(label);
  };
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
  compare("Plan.name", before.variant.name, after.variant.name);
  compare("Plan.color", before.variant.color, after.variant.color);
  compare("day.membership", ids(before.days), ids(after.days));
  for (const day of before.days) {
    const next = after.days.find((row) => row.id === day.id);
    if (!next) continue;
    for (const field of ["day_number", "date", "title", "notes"] as const)
      compare(`day.${field}`, day[field], next[field]);
    compare("item.membership", ids(day.items), ids(next.items));
    for (const item of day.items) {
      const other = next.items.find((row) => row.id === item.id);
      if (!other) continue;
      compare("item.sort_order", item.sort_order, other.sort_order);
      const a = JSON.parse(itemEditableSnapshot(item));
      const b = JSON.parse(itemEditableSnapshot(other));
      for (const field of [
        "title",
        "type",
        "day",
        "notes",
        "start",
        "end",
        "price",
        "currency",
        "placeId",
        "booking",
        "links",
      ])
        compare(`item.${field}`, a[field], b[field]);
      if (JSON.stringify(a.details) !== JSON.stringify(b.details)) {
        const fields = [
          "mode",
          "origin",
          "destination",
          "originPlace",
          "destinationPlace",
          "arrivalDate",
          "arrivalTime",
          "departureDate",
          "provider",
          "serviceNumber",
        ];
        const changed = fields.filter(
          (field) => JSON.stringify(a.details?.[field]) !== JSON.stringify(b.details?.[field]),
        );
        if (!changed.length) changes.add("item.details.other");
        for (const field of changed) changes.add(`item.details.${field}`);
      }
    }
  }
  compare(
    "route.membership",
    before.routePlans.map((row) => row.day_id).sort(),
    after.routePlans.map((row) => row.day_id).sort(),
  );
  for (const plan of before.routePlans) {
    const next = after.routePlans.find((row) => row.day_id === plan.day_id);
    if (!next) continue;
    compare(
      "route.stops",
      plan.stops.map((row) => row.item_id),
      next.stops.map((row) => row.item_id),
    );
    compare(
      "route.modes",
      plan.legs.map((row) => row.mode),
      next.legs.map((row) => row.mode),
    );
  }
  return [...changes];
}
