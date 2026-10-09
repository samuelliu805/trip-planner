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
