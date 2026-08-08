"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { categories } from "@/features/itinerary/components/planner-config";
import {
  encodePlannerClipboard,
  fillTargetRows,
  parsePlannerClipboard,
  selectionBounds,
  type GridCoordinate,
  type PlannerClipboard,
} from "@/features/itinerary/grid-interactions";
import { useCopyItineraryItems } from "@/features/itinerary/day-mutations";
import { useDeleteItineraryItem } from "@/features/itinerary/item-mutations";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import type { ItineraryItemType, PlannerDay, PlannerWorkspace } from "@/features/itinerary/types";

export function usePlannerClipboard({
  selectionAnchor,
  selectionEnd,
  setInteractionError,
  tripId,
  workspace,
}: {
  selectionAnchor: GridCoordinate;
  selectionEnd: GridCoordinate;
  setInteractionError: Dispatch<SetStateAction<string | undefined>>;
  tripId: string;
  workspace: PlannerWorkspace;
}) {
  const queryClient = useQueryClient();
  const variantId = workspace.variant.id;
  const copyMutation = useCopyItineraryItems(tripId, variantId);
  const deleteMutation = useDeleteItineraryItem(tripId, variantId);
  const [copyDaysOpen, setCopyDaysOpen] = useState(false);
  const [targetDays, setTargetDays] = useState<Set<string>>(new Set());
  const [internalClipboard, setInternalClipboard] = useState<PlannerClipboard | null>(null);
  const [requestPending, setRequestPending] = useState(false);
  const pendingDepth = useRef(0);
  const selectionEndRef = useRef(selectionEnd);
  useEffect(() => {
    selectionEndRef.current = selectionEnd;
  }, [selectionEnd]);

  async function withRequestPending<T>(request: () => Promise<T>) {
    pendingDepth.current += 1;
    setRequestPending(true);
    try {
      return await request();
    } finally {
      pendingDepth.current -= 1;
      if (pendingDepth.current === 0) setRequestPending(false);
    }
  }

  function clipboardPayload(): PlannerClipboard | null {
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top !== bounds.bottom) return null;
    const cells = [];
    for (let row = bounds.top; row <= bounds.bottom; row += 1)
      for (let column = bounds.left; column <= bounds.right; column += 1) {
        const day = workspace.days[row];
        const category = categories[column];
        if (!day || !category) continue;
        const items = day.items
          .filter((item) => category.types.includes(item.type))
          .map(({ id }) => id);
        cells.push({ columnOffset: column - bounds.left, items, rowOffset: row - bounds.top });
      }
    return cells.length
      ? { cells, kind: "trip-planner/items", sourceColumn: bounds.left, version: 2 }
      : null;
  }

  async function copySelectionToClipboard() {
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top !== bounds.bottom) {
      setInteractionError("Copy and paste works with cells selected across one row only.");
      return;
    }
    const payload = clipboardPayload();
    if (!payload) {
      setInteractionError("The selected cells do not contain items to copy.");
      return;
    }
    setInternalClipboard(payload);
    setInteractionError(undefined);
    await withRequestPending(async () => {
      try {
        await navigator.clipboard.writeText(encodePlannerClipboard(payload));
      } catch {
        /* The internal clipboard remains available. */
      }
    });
  }

  async function replaceCategoryItems(
    operations: { sourceItemIds: string[]; targetDay: PlannerDay; types: ItineraryItemType[] }[],
  ) {
    await withRequestPending(async () => {
      const previous = queryClient.getQueryData<PlannerWorkspace>(
        plannerQueryKey(tripId, variantId),
      );
      const replacements = operations
        .filter(
          (operation) =>
            !operation.targetDay.items.some((item) => operation.sourceItemIds.includes(item.id)),
        )
        .map((operation) => ({
          ...operation,
          replacedItems: operation.targetDay.items.filter((item) =>
            operation.types.includes(item.type),
          ),
        }));
      try {
        const replacedIds = new Set(
          replacements.flatMap(({ replacedItems }) => replacedItems.map(({ id }) => id)),
        );
        queryClient.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
          current
            ? {
                ...current,
                days: current.days.map((day) => ({
                  ...day,
                  items: day.items.filter(({ id }) => !replacedIds.has(id)),
                })),
              }
            : current,
        );
        await Promise.all(
          replacements.flatMap(({ replacedItems }) =>
            replacedItems.map((item) =>
              deleteMutation.mutateAsync({ id: item.id, tripId, variantId }),
            ),
          ),
        );
        await Promise.all(
          replacements
            .filter(({ sourceItemIds }) => sourceItemIds.length > 0)
            .map(({ sourceItemIds, targetDay }) =>
              copyMutation.mutateAsync({
                sourceItemIds,
                targetDayId: targetDay.id,
                tripId,
                variantId,
              }),
            ),
        );
        setInteractionError(undefined);
      } catch (error) {
        queryClient.setQueryData(plannerQueryKey(tripId, variantId), previous);
        void queryClient.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        setInteractionError(
          error instanceof Error
            ? `${error.message} Refreshing the planner to confirm saved values.`
            : "The destination cells could not be replaced.",
        );
      }
    });
  }

  async function pastePayload(payload: PlannerClipboard) {
    try {
      const selectedBounds = selectionBounds(selectionAnchor, selectionEnd);
      if (selectedBounds.top !== selectedBounds.bottom)
        throw new Error("Paste works only when the selected destination cells are in one row.");
      const destination = { column: selectedBounds.left, row: selectedBounds.top };
      if (destination.column !== payload.sourceColumn)
        throw new Error(
          `Paste blocked: copied ${categories[payload.sourceColumn]?.label ?? "column"} cells can only be pasted into the same column.`,
        );
      const operations = payload.cells.map((cell) => {
        const category = categories[destination.column + cell.columnOffset];
        if (!category) throw new Error("Clipboard data does not fit the selected range.");
        const day = workspace.days[destination.row + cell.rowOffset];
        if (!day) throw new Error("Clipboard data does not fit the available trip days.");
        return { sourceItemIds: cell.items, targetDay: day, types: category.types };
      });
      await replaceCategoryItems(operations);
    } catch (error) {
      setInteractionError(
        error instanceof Error ? error.message : "The copied items could not be pasted.",
      );
    }
  }

  async function pasteAvailableClipboard() {
    await withRequestPending(async () => {
      let payload = internalClipboard;
      if (!payload)
        try {
          payload = parsePlannerClipboard(await navigator.clipboard.readText());
        } catch {
          /* System clipboard access is optional. */
        }
      if (payload) await pastePayload(payload);
      else setInteractionError("Copy planner cells before pasting.");
    });
  }

  async function fillDown(anchor = selectionAnchor, end = selectionEndRef.current) {
    const bounds = selectionBounds(anchor, end);
    const sourceDay = workspace.days[bounds.top];
    if (!sourceDay || bounds.bottom === bounds.top) {
      setInteractionError("Select at least two day rows to fill down.");
      return;
    }
    const selectedCategories = categories.slice(bounds.left, bounds.right + 1);
    await replaceCategoryItems(
      fillTargetRows(anchor, end).flatMap((row) =>
        selectedCategories.map((category) => ({
          sourceItemIds: sourceDay.items
            .filter((item) => category.types.includes(item.type))
            .map(({ id }) => id),
          targetDay: workspace.days[row],
          types: category.types,
        })),
      ),
    );
  }

  async function copyPreviousDay() {
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top < 1) {
      setInteractionError("The first day has no previous day to copy.");
      return;
    }
    const source = workspace.days[bounds.top - 1];
    const target = workspace.days[bounds.top];
    await replaceCategoryItems(
      categories.slice(bounds.left, bounds.right + 1).map((category) => ({
        sourceItemIds: source.items
          .filter((item) => category.types.includes(item.type))
          .map(({ id }) => id),
        targetDay: target,
        types: category.types,
      })),
    );
  }

  async function copyToSelectedDays() {
    if (!targetDays.size) {
      setInteractionError("Choose at least one destination day.");
      return;
    }
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    const sourceDay = workspace.days[bounds.top];
    if (!sourceDay) return;
    const destinationDayIds = [...targetDays].filter((dayId) => dayId !== sourceDay.id);
    if (!destinationDayIds.length) {
      setInteractionError("Choose a destination day other than the source day.");
      return;
    }
    const selectedCategories = categories.slice(bounds.left, bounds.right + 1);
    await replaceCategoryItems(
      destinationDayIds.flatMap((dayId) => {
        const targetDay = workspace.days.find((day) => day.id === dayId);
        return targetDay
          ? selectedCategories.map((category) => ({
              sourceItemIds: sourceDay.items
                .filter((item) => category.types.includes(item.type))
                .map(({ id }) => id),
              targetDay,
              types: category.types,
            }))
          : [];
      }),
    );
    setTargetDays(new Set());
    setCopyDaysOpen(false);
  }

  return {
    clipboardPayload,
    copyDaysOpen,
    copyMutation,
    copyPreviousDay,
    copySelectionToClipboard,
    copyToSelectedDays,
    fillDown,
    internalClipboard,
    pasteAvailableClipboard,
    pastePayload,
    requestPending,
    setCopyDaysOpen,
    setInternalClipboard,
    setTargetDays,
    targetDays,
  };
}
