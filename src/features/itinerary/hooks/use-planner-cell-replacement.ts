"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";

import { useCopyItineraryItems } from "../day-mutations";
import { isMatrixVisibleItem } from "../flight-endpoints";
import { plannerQueryKey } from "../planner-query";
import { isItineraryConflict } from "../query-cache";
import type { PlannerCellReplacement } from "../planner-clipboard-paste";
import type { PlannerDay, PlannerWorkspace } from "../types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

export function usePlannerCellReplacement({
  tripId,
  workspace,
  setInteractionError,
  setInteractionConflict,
  withRequestPending,
}: {
  tripId: string;
  workspace: PlannerWorkspace;
  setInteractionError: Dispatch<SetStateAction<string | undefined>>;
  setInteractionConflict: Dispatch<SetStateAction<boolean>>;
  withRequestPending: <T>(request: () => Promise<T>) => Promise<T>;
}) {
  const queryClient = useQueryClient();
  const variantId = workspace.variant.id;
  const copyMutation = useCopyItineraryItems(tripId, variantId);

  async function replaceCategoryItems(
    operations: PlannerCellReplacement[],
    sourceWorkspace = workspace,
  ) {
    await withRequestPending(async () => {
      const previous = queryClient.getQueryData<PlannerWorkspace>(
        plannerQueryKey(tripId, variantId),
      );
      const currentDays = new Map(previous?.days.map((day) => [day.id, day]) ?? []);
      const replacements = operations
        .map((operation) => ({
          ...operation,
          targetDay: currentDays.get(operation.targetDay.id) ?? operation.targetDay,
        }))
        .filter(
          (operation) =>
            !operation.targetDay.items.some((item) => operation.sourceItemIds.includes(item.id)),
        )
        .map((operation) => ({
          ...operation,
          replacedItems:
            operation.replaceExisting === false
              ? []
              : operation.targetDay.items.filter(
                  (item) => operation.types.includes(item.type) && isMatrixVisibleItem(item),
                ),
        }));
      const grouped = new Map<
        string,
        { sourceItemIds: string[]; replaceTargetItemIds: string[]; targetDay: PlannerDay }
      >();
      for (const { replacedItems, sourceItemIds, targetDay } of replacements) {
        const group = grouped.get(targetDay.id) ?? {
          replaceTargetItemIds: [],
          sourceItemIds: [],
          targetDay,
        };
        group.sourceItemIds.push(...sourceItemIds);
        group.replaceTargetItemIds.push(...replacedItems.map(({ id }) => id));
        grouped.set(targetDay.id, group);
      }
      setInteractionConflict(false);
      try {
        const replacedIds = new Set(
          replacements.flatMap(({ replacedItems }) => replacedItems.map(({ id }) => id)),
        );
        const itemVersions = new Map(
          (previous ?? workspace).days
            .flatMap(({ items }) => items)
            .map((item) => [item.id, item.version]),
        );
        const sourceVersions = new Map(
          (sourceWorkspace.variant.id === variantId
            ? (previous ?? sourceWorkspace)
            : sourceWorkspace
          ).days
            .flatMap(({ items }) => items)
            .map((item) => [item.id, item.version]),
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
          [...grouped.values()]
            .filter(
              ({ replaceTargetItemIds, sourceItemIds }) =>
                sourceItemIds.length > 0 || replaceTargetItemIds.length > 0,
            )
            .map(({ replaceTargetItemIds, sourceItemIds, targetDay }) =>
              copyMutation.mutateAsync({
                expectedItemsVersion: targetDay.items_version,
                operationId: newTelemetryOperationId(),
                replaceTargetItemIds,
                replaceTargetVersions: replaceTargetItemIds.map((id) => itemVersions.get(id) ?? 0),
                sourceItemIds,
                sourceVariantId: sourceWorkspace.variant.id,
                sourceVersions: sourceItemIds.map((id) => sourceVersions.get(id) ?? 0),
                targetDayId: targetDay.id,
                tripId,
                variantId,
              }),
            ),
        );
        // The copy RPC returns items, but not the advanced day/variant collection versions.
        // Keep the interaction pending until those versions are back in the query cache.
        await queryClient.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        setInteractionError(undefined);
      } catch (error) {
        queryClient.setQueryData(plannerQueryKey(tripId, variantId), previous);
        await queryClient.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        setInteractionConflict(isItineraryConflict(error));
        setInteractionError(
          error instanceof Error ? error.message : "The destination cells could not be replaced.",
        );
      }
    });
  }

  return { copyMutation, replaceCategoryItems };
}
