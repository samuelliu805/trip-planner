"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  categories,
  type EditorState,
  type PlannerCategory,
} from "@/features/itinerary/components/planner-config";
import {
  moveGridFocus,
  selectionBounds,
  type GridCoordinate,
} from "@/features/itinerary/grid-interactions";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-types";
import { focusPlannerSavedItem } from "@/features/itinerary/planner-saved-item-focus";

type Ref<T> = MutableRefObject<T>;
type SetCoordinate = (coordinate: GridCoordinate) => void;

export function usePlannerInteractions({
  containerRef,
  fillDown,
  fillDragging,
  fillFrame,
  fillSourceRight,
  rangeJustSelected,
  selectedItemId,
  selectionAnchor,
  selectionEnd,
  selectionEndRef,
  setEditor,
  setInteractionError,
  setIsFillDragging,
  setSelectedItemId,
  setSelectedDayRow,
  setSelectedMapItemId,
  setMapMode,
  setSelectionAnchor,
  setSelectionEnd,
  setSplit,
  workspace,
}: {
  containerRef: Ref<HTMLDivElement | null>;
  fillDown: (anchor?: GridCoordinate, end?: GridCoordinate) => Promise<void>;
  fillDragging: Ref<boolean>;
  fillFrame: Ref<number | null>;
  fillSourceRight: Ref<number>;
  rangeJustSelected: Ref<boolean>;
  selectedItemId?: string;
  selectionAnchor: GridCoordinate;
  selectionEnd: GridCoordinate;
  selectionEndRef: Ref<GridCoordinate>;
  setEditor: Dispatch<SetStateAction<EditorState | null>>;
  setInteractionError: Dispatch<SetStateAction<string | undefined>>;
  setIsFillDragging: Dispatch<SetStateAction<boolean>>;
  setSelectedItemId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedDayRow: Dispatch<SetStateAction<number | null>>;
  setSelectedMapItemId: Dispatch<SetStateAction<string | undefined>>;
  setMapMode: (mode: PlannerMapMode) => void;
  setSelectionAnchor: Dispatch<SetStateAction<GridCoordinate>>;
  setSelectionEnd: SetCoordinate;
  setSplit: Dispatch<SetStateAction<number>>;
  workspace: PlannerWorkspace;
}) {
  function focusCell(coordinate: GridCoordinate, extend: boolean) {
    if (rangeJustSelected.current) {
      rangeJustSelected.current = false;
      return;
    }
    const selectedAgain =
      !extend &&
      selectionAnchor.row === coordinate.row &&
      selectionAnchor.column === coordinate.column &&
      selectionEnd.row === coordinate.row &&
      selectionEnd.column === coordinate.column;
    if (selectedAgain) {
      setSelectedDayRow(null);
      setSelectedItemId(undefined);
      setSelectedMapItemId(undefined);
      setSelectionAnchor({ column: -1, row: -1 });
      setSelectionEnd({ column: -1, row: -1 });
      setMapMode("overview");
      return;
    }
    setSelectedDayRow(null);
    setSelectedItemId(undefined);
    setSelectedMapItemId(undefined);
    if (!extend) {
      const category = categories[coordinate.column];
      if (category?.id === "city") setMapMode("overview");
      if (["activities", "hotel", "meals"].includes(category?.id ?? "")) {
        setMapMode("day_route");
      }
    }
    if (extend) setSelectionEnd(coordinate);
    else {
      setSelectionAnchor(coordinate);
      setSelectionEnd(coordinate);
    }
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-cell="${coordinate.row}-${coordinate.column}"]`)
        ?.focus(),
    );
  }

  function selectDay(row: number) {
    setSelectedDayRow(row);
    setSelectedItemId(undefined);
    setSelectedMapItemId(undefined);
    setSelectionAnchor({ column: -1, row: -1 });
    setSelectionEnd({ column: -1, row: -1 });
    setInteractionError(undefined);
  }

  function selectItem(item: ItineraryItem, coordinate: GridCoordinate) {
    setSelectedDayRow(null);
    setSelectionAnchor(coordinate);
    setSelectionEnd(coordinate);
    if (selectedItemId === item.id) {
      setSelectedItemId(undefined);
      setSelectedMapItemId(undefined);
      return;
    }
    setSelectedItemId(item.id);
    if (item.type === "location") {
      setMapMode("overview");
      setSelectedMapItemId(item.place ? item.id : undefined);
      return;
    }
    if (["activity", "hotel", "meal"].includes(item.type)) {
      setMapMode("day_route");
      setSelectedMapItemId(item.place ? item.id : undefined);
      return;
    }
    setSelectedMapItemId(undefined);
  }

  function focusSavedItem(item: ItineraryItem) {
    focusPlannerSavedItem(item, {
      setInteractionError,
      setMapMode,
      setSelectedDayRow,
      setSelectedItemId,
      setSelectedMapItemId,
      setSelectionAnchor,
      setSelectionEnd,
      workspace,
    });
  }

  function startRangeSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (
      window.innerWidth < 1200 ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest(
        "button, input, textarea, [role='menuitem'], [role='option']",
      )
    )
      return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell?.dataset.cell) return;
    const [row, column] = cell.dataset.cell.split("-").map(Number);
    let moved = false;
    const move = (moveEvent: PointerEvent) => {
      const target = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>("[data-cell]");
      if (!target?.dataset.cell) return;
      const [nextRow, nextColumn] = target.dataset.cell.split("-").map(Number);
      if (nextRow === row && nextColumn === column) return;
      if (!moved) setSelectionAnchor({ column, row });
      moved = true;
      setSelectionEnd({ column: nextColumn, row });
    };
    const stop = () => {
      rangeJustSelected.current = moved;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function handleCellKey(
    event: React.KeyboardEvent,
    coordinate: GridCoordinate,
    dayId: string,
    category: PlannerCategory,
    items: ItineraryItem[],
  ) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(event.key)) {
      event.preventDefault();
      focusCell(
        moveGridFocus(
          coordinate,
          event.key,
          workspace.days.length,
          categories.length,
          event.shiftKey,
        ),
        event.shiftKey && event.key !== "Tab",
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (category.id === "city") return;
      const item = items[0];
      setEditor(item ? { dayId, item, type: item.type } : { dayId, type: category.defaultType });
    }
    if (event.key === "Escape") {
      setEditor(null);
      focusCell(coordinate, false);
    }
  }

  function startFill(event: React.PointerEvent) {
    if (window.innerWidth < 1200) return;
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top !== bounds.bottom) {
      setInteractionError("Drag fill works only with cells selected across one row.");
      return;
    }
    const sourceAnchor = { column: bounds.left, row: bounds.top };
    const sourceEnd = { column: bounds.right, row: bounds.top };
    event.preventDefault();
    event.stopPropagation();
    fillSourceRight.current = bounds.right;
    fillDragging.current = true;
    setIsFillDragging(true);
    setSelectionAnchor(sourceAnchor);
    setSelectionEnd(sourceEnd);
    const finish = () => {
      const fillEnd = selectionEndRef.current;
      fillDragging.current = false;
      setIsFillDragging(false);
      if (fillFrame.current !== null) cancelAnimationFrame(fillFrame.current);
      fillFrame.current = null;
      window.removeEventListener("pointerup", finish);
      setSelectionAnchor({ column: -1, row: -1 });
      setSelectionEnd({ column: -1, row: -1 });
      void fillDown(sourceAnchor, fillEnd);
    };
    window.addEventListener("pointerup", finish);
  }

  function openEditorFromDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button") && !target.closest("[data-edit-item]")) return;
    const cell = target.closest<HTMLElement>("[data-cell]");
    if (!cell?.dataset.cell) return;
    const [row, column] = cell.dataset.cell.split("-").map(Number);
    const day = workspace.days[row];
    const category = categories[column];
    if (!day || !category) return;
    if (category.id === "city") return;
    const requestedId = target.closest<HTMLElement>("[data-edit-item]")?.dataset.editItem;
    const item = requestedId
      ? day.items.find(({ id }) => id === requestedId)
      : day.items.find((candidate) => category.types.includes(candidate.type));
    setEditor(
      item
        ? { dayId: day.id, item, type: item.type }
        : { dayId: day.id, type: category.defaultType },
    );
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (bounds)
        setSplit(
          Math.min(68, Math.max(45, ((moveEvent.clientX - bounds.left) / bounds.width) * 100)),
        );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return {
    focusCell,
    focusSavedItem,
    handleCellKey,
    openEditorFromDoubleClick,
    selectItem,
    selectDay,
    startFill,
    startRangeSelection,
    startResize,
  };
}
