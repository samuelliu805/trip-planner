import { matrixCategoryColumns as categories } from "./components/matrix-columns.ts";
import { isMatrixVisibleItem } from "./flight-endpoints.ts";
import {
  itemPasteCoordinates,
  selectionBounds,
  type GridCoordinate,
  type PlannerClipboard,
} from "./grid-interactions.ts";
import type { ItineraryItemType, PlannerDay, PlannerWorkspace } from "./types.ts";

export type PlannerCellReplacement = {
  sourceItemIds: string[];
  targetDay: PlannerDay;
  types: ItineraryItemType[];
  replaceExisting?: boolean;
};

export function plannerClipboardOperations(
  payload: PlannerClipboard,
  anchor: GridCoordinate,
  end: GridCoordinate,
  sourceWorkspace: PlannerWorkspace,
  targetWorkspace: PlannerWorkspace,
): PlannerCellReplacement[] {
  const sourceItems = new Map(
    sourceWorkspace.days.flatMap(({ items }) => items).map((item) => [item.id, item]),
  );
  function requireSource(id: string) {
    const item = sourceItems.get(id);
    if (!item || !isMatrixVisibleItem(item))
      throw new Error("The copied item is no longer available. Copy it again before pasting.");
    return item;
  }
  if (payload.kind === "trip-planner/item") {
    const source = requireSource(payload.itemId);
    if (source.type !== payload.itemType)
      throw new Error("The copied item is no longer available. Copy it again before pasting.");
    return itemPasteCoordinates(anchor, end, source.type, targetWorkspace.days.length).map(
      ({ row }) => ({
        sourceItemIds: [source.id],
        targetDay: targetWorkspace.days[row],
        types: [source.type],
        replaceExisting: false,
      }),
    );
  }
  const bounds = selectionBounds(anchor, end);
  if (bounds.top !== bounds.bottom)
    throw new Error("Paste works only when the selected destination cells are in one row.");
  const destination = { column: bounds.left, row: bounds.top };
  if (destination.column !== payload.sourceColumn)
    throw new Error(
      `Paste blocked: copied ${categories[payload.sourceColumn]?.label ?? "column"} cells can only be pasted into the same column.`,
    );
  return payload.cells.map((cell) => {
    const category = categories[destination.column + cell.columnOffset];
    if (!category) throw new Error("Clipboard data does not fit the selected range.");
    const day = targetWorkspace.days[destination.row + cell.rowOffset];
    if (!day) throw new Error("Clipboard data does not fit the available trip days.");
    for (const id of cell.items) {
      if (!category.types.includes(requireSource(id).type))
        throw new Error("Clipboard data does not fit the selected range.");
    }
    return { sourceItemIds: cell.items, targetDay: day, types: category.types };
  });
}
