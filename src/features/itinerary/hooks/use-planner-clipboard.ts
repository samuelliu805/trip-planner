"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { categories } from "@/features/itinerary/components/planner-config";
import { isMatrixVisibleItem } from "@/features/itinerary/flight-endpoints";
import {
  encodePlannerClipboard,
  fillTargetRows,
  parsePlannerClipboard,
  selectionBounds,
  type GridCoordinate,
  type PlannerClipboard,
} from "@/features/itinerary/grid-interactions";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { isItineraryConflict, requireData } from "@/features/itinerary/query-cache";
import { loadPlannerWorkspace } from "../actions";
import { plannerClipboardOperations } from "../planner-clipboard-paste";
import { usePlannerOutbox } from "../planner-outbox-provider";
import { findPlannerRuntime } from "../planner-runtime-owner";
import { usePlannerCellReplacement } from "./use-planner-cell-replacement";
import { usePlannerClipboardStorage } from "./use-planner-clipboard-storage";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";

export function usePlannerClipboard({
  selectionAnchor,
  selectionEnd,
  setInteractionError,
  setInteractionConflict,
  tripId,
  workspace,
}: {
  selectionAnchor: GridCoordinate;
  selectionEnd: GridCoordinate;
  setInteractionError: Dispatch<SetStateAction<string | undefined>>;
  setInteractionConflict: Dispatch<SetStateAction<boolean>>;
  tripId: string;
  workspace: PlannerWorkspace;
}) {
  const queryClient = useQueryClient();
  const outbox = usePlannerOutbox();
  const variantId = workspace.variant.id;
  const [copyDaysOpen, setCopyDaysOpen] = useState(false);
  const [targetDays, setTargetDays] = useState<Set<string>>(new Set());
  const { internalClipboard, setInternalClipboard } = usePlannerClipboardStorage(tripId);
  const source = { tripId, variantId };
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

  const { copyMutation, replaceCategoryItems } = usePlannerCellReplacement({
    tripId,
    workspace,
    setInteractionError,
    setInteractionConflict,
    withRequestPending,
  });

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
          .filter((item) => category.types.includes(item.type) && isMatrixVisibleItem(item))
          .map(({ id }) => id);
        cells.push({ columnOffset: column - bounds.left, items, rowOffset: row - bounds.top });
      }
    return cells.length
      ? { cells, kind: "trip-planner/items", source, sourceColumn: bounds.left, version: 2 }
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
    await storeClipboard(payload);
  }

  async function storeClipboard(payload: PlannerClipboard) {
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

  async function copyItemToClipboard(item: ItineraryItem) {
    await storeClipboard({
      source,
      itemId: item.id,
      itemType: item.type,
      kind: "trip-planner/item",
      version: 1,
    });
  }

  async function copyCellToClipboard(coordinate: GridCoordinate) {
    const day = workspace.days[coordinate.row];
    const category = categories[coordinate.column];
    if (!day || !category) return;
    await storeClipboard({
      cells: [
        {
          columnOffset: 0,
          items: day.items
            .filter((item) => category.types.includes(item.type) && isMatrixVisibleItem(item))
            .map(({ id }) => id),
          rowOffset: 0,
        },
      ],
      kind: "trip-planner/items",
      source,
      sourceColumn: coordinate.column,
      version: 2,
    });
  }

  async function pastePayload(payload: PlannerClipboard) {
    await withRequestPending(async () => {
      try {
        if (payload.source && payload.source.tripId !== tripId)
          throw new Error("Paste blocked: copied items belong to another trip.");
        const sourceVariantId = payload.source?.variantId ?? variantId;
        const sourceRuntime = outbox
          ? findPlannerRuntime([...outbox.scope.slice(0, 3), sourceVariantId])
          : undefined;
        const sourceWorkspace =
          sourceVariantId === variantId
            ? (queryClient.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)) ??
              workspace)
            : await queryClient.fetchQuery({
                queryKey: plannerQueryKey(tripId, sourceVariantId),
                queryFn: async () => {
                  const loaded = requireData(await loadPlannerWorkspace(tripId, sourceVariantId));
                  return sourceRuntime ? sourceRuntime.reconcile(loaded) : loaded;
                },
                staleTime: 0,
              });
        const operations = plannerClipboardOperations(
          payload,
          selectionAnchor,
          selectionEnd,
          sourceWorkspace,
          workspace,
        );
        await replaceCategoryItems(operations, sourceWorkspace);
      } catch (error) {
        setInteractionConflict(isItineraryConflict(error));
        setInteractionError(
          error instanceof Error ? error.message : "The copied items could not be pasted.",
        );
      }
    });
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
    const sourceDay = workspace.days[anchor.row];
    if (!sourceDay || anchor.row === end.row) {
      setInteractionError("Select at least two day rows to fill down.");
      return;
    }
    const selectedCategories = categories.slice(bounds.left, bounds.right + 1);
    await replaceCategoryItems(
      fillTargetRows(anchor, end).flatMap((row) =>
        selectedCategories.map((category) => ({
          sourceItemIds: sourceDay.items
            .filter((item) => category.types.includes(item.type) && isMatrixVisibleItem(item))
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
          .filter((item) => category.types.includes(item.type) && isMatrixVisibleItem(item))
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
                .filter((item) => category.types.includes(item.type) && isMatrixVisibleItem(item))
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
    copyCellToClipboard,
    copyDaysOpen,
    copyItemToClipboard,
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
