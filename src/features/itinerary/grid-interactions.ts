import { z } from "zod";

export type GridCoordinate = { column: number; row: number };

export type ClipboardCell = {
  columnOffset: number;
  items: string[];
  rowOffset: number;
};

export type PlannerClipboard = {
  cells: ClipboardCell[];
  kind: "trip-planner/items";
  version: 1;
};

const clipboardSchema = z.object({
  cells: z.array(z.object({
    columnOffset: z.number().int().min(0),
    items: z.array(z.uuid()),
    rowOffset: z.number().int().min(0),
  })).min(1),
  kind: z.literal("trip-planner/items"),
  version: z.literal(1),
}).strict();

export function selectionBounds(anchor: GridCoordinate, end: GridCoordinate) {
  return {
    bottom: Math.max(anchor.row, end.row),
    left: Math.min(anchor.column, end.column),
    right: Math.max(anchor.column, end.column),
    top: Math.min(anchor.row, end.row),
  };
}

export function selectionContains(anchor: GridCoordinate, end: GridCoordinate, coordinate: GridCoordinate) {
  const bounds = selectionBounds(anchor, end);
  return coordinate.row >= bounds.top && coordinate.row <= bounds.bottom
    && coordinate.column >= bounds.left && coordinate.column <= bounds.right;
}

export function moveGridFocus(current: GridCoordinate, key: string, rowCount: number, columnCount: number, shiftKey = false) {
  let row = current.row;
  let column = current.column;
  if (key === "ArrowUp") row -= 1;
  if (key === "ArrowDown") row += 1;
  if (key === "ArrowLeft" || (key === "Tab" && shiftKey)) column -= 1;
  if (key === "ArrowRight" || (key === "Tab" && !shiftKey)) column += 1;
  if (column < 0) { column = columnCount - 1; row -= 1; }
  if (column >= columnCount) { column = 0; row += 1; }
  return {
    column: Math.min(columnCount - 1, Math.max(0, column)),
    row: Math.min(rowCount - 1, Math.max(0, row)),
  };
}

export function encodePlannerClipboard(value: PlannerClipboard) {
  return JSON.stringify(value);
}

export function parsePlannerClipboard(value: string) {
  try {
    const parsed = clipboardSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function fillTargetRows(anchor: GridCoordinate, end: GridCoordinate) {
  const bounds = selectionBounds(anchor, end);
  return Array.from({ length: Math.max(0, bounds.bottom - bounds.top) }, (_, index) => bounds.top + index + 1);
}
