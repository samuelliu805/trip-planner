"use client";

import { rollbackWorkspaceChange } from "@/features/itinerary/workspace-rollback";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { loadPlannerWorkspace } from "./actions";
import { copyItineraryItems } from "./day-actions";
import type { CopyItineraryItemsInput } from "./day-schema";
import {
  affectsDecisionSummary,
  affectsLocalityProjection,
  plannerWorkspaceItems,
} from "./mutation-impact";
import { rebaseUnchangedCopy } from "./mutation-rebase";
import { retryPlannerMutation } from "./mutation-retry";
import { plannerQueryKey } from "./planner-query";
import { usePlannerPersistence } from "./planner-persistence";
import { usePlannerOutbox } from "./planner-outbox-provider";
import { createLocalCopies } from "./structure-sync";
import { removeItem, replaceItem, requireData } from "./query-cache";
import { insertActivityAtPlacement } from "./activity-order";
import type { ItineraryItem, PlannerWorkspace } from "./types";
import { invalidateVariantComparison, invalidateVariantDecisionSummary } from "../variants/queries";
import { refreshResearchWorkspace } from "../research/research-query";
import { itemKindsForTelemetry, newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

export function useCopyItineraryItems(tripId: string, variantId: string) {
  const client = useQueryClient();
  const persistence = usePlannerPersistence();
  const outbox = usePlannerOutbox();
  return useMutation({
    networkMode: "always",
    mutationFn: async (input: CopyItineraryItemsInput) => {
      if (outbox) {
        const sourceId = input.sourceVariantId ?? variantId;
        const sourceWorkspace =
          sourceId === variantId
            ? outbox.project()
            : (client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, sourceId)) ??
              requireData(await loadPlannerWorkspace(tripId, sourceId)));
        const all = sourceWorkspace.days.flatMap((day) => day.items);
        const sources = input.sourceItemIds.map((id) => all.find((item) => item.id === id));
        if (sources.some((item) => !item))
          throw new Error("A source item is unavailable. Reload the source Plan.");
        input.copiedItemIds ??= input.sourceItemIds.map(() => crypto.randomUUID());
        const copiedItems = createLocalCopies(input, sources as ItineraryItem[]);
        const replacements = outbox
          .project()
          .days.flatMap((day) => day.items)
          .filter((item) => input.replaceTargetItemIds?.includes(item.id));
        if (replacements.length !== (input.replaceTargetItemIds?.length ?? 0))
          throw new Error("A replacement item is unavailable. Review the selection.");
        outbox.accept({
          kind: "copy",
          input,
          sources: sources as ItineraryItem[],
          replacements,
          copiedItems,
        });
        return copiedItems;
      }
      if (persistence) return persistence.copyItems(input);
      return retryPlannerMutation(
        input,
        async (value) => requireData(await copyItineraryItems(value)),
        async (value, latest) => {
          const source =
            value.sourceVariantId && value.sourceVariantId !== variantId
              ? requireData(await loadPlannerWorkspace(tripId, value.sourceVariantId))
              : latest;
          return rebaseUnchangedCopy(value, latest, source);
        },
        tripId,
        variantId,
      );
    },
    onMutate: async (input) => {
      if (outbox) return;
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const sourceWorkspace = client.getQueryData<PlannerWorkspace>(
        plannerQueryKey(tripId, input.sourceVariantId ?? variantId),
      );
      const workspaceItems = plannerWorkspaceItems(sourceWorkspace ?? previous);
      const sources = input.sourceItemIds
        .map((id) => workspaceItems.find((item) => item.id === id))
        .filter((item): item is ItineraryItem => Boolean(item));
      const itemKinds = itemKindsForTelemetry(sources.map(({ type }) => type));
      input.itemKinds ??= itemKinds;
      input.operationId ??= newTelemetryOperationId();
      input.surface ??= "planner";
      itemKinds.forEach((itemKind) =>
        captureBrowserProductEvent(
          "item_create_started",
          {
            item_kind: itemKind,
            operation_id: input.operationId!,
            surface: "planner",
          },
          { actorType: persistence?.actorType ?? "authenticated" },
        ),
      );
      const destination = previous?.days.find(({ id }) => id === input.targetDayId);
      const nextOrder =
        destination?.items.reduce((maximum, item) => Math.max(maximum, item.sort_order), -1) ?? -1;
      const optimistic = sources.map((source, index): ItineraryItem => ({
        ...source,
        created_at: new Date().toISOString(),
        day_id: input.targetDayId,
        id: `optimistic-${crypto.randomUUID()}`,
        variant_id: variantId,
        place_id: input.preservePlace === false ? null : source.place_id,
        sort_order: nextOrder + index + 1,
        updated_at: new Date().toISOString(),
      }));
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        current
          ? {
              ...current,
              days: current.days.map((day) =>
                day.id === input.targetDayId
                  ? {
                      ...day,
                      items: optimistic.reduce(
                        (items, item) => insertActivityAtPlacement(items, item),
                        day.items,
                      ),
                    }
                  : day,
              ),
            }
          : current,
      );
      return {
        optimisticIds: optimistic.map(({ id }) => id),
        previous,
        sources,
        applied: client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)),
      };
    },
    onError: (_error, _input, context) =>
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        rollbackWorkspaceChange(current, context?.previous, context?.applied),
      ),
    onSuccess: async (items, input, context) => {
      if (outbox) return;
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        items.reduce(
          (workspace, item) => {
            const source = context?.sources.find(
              ({ place_id }) => Boolean(place_id) && place_id === item.place_id,
            );
            return replaceItem(workspace, {
              ...item,
              place: input.preservePlace === false ? null : (item.place ?? source?.place ?? null),
            });
          },
          context?.optimisticIds.reduce((workspace, id) => removeItem(workspace, id), current),
        ),
      );
      if (!persistence) {
        await client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        if (context?.sources.some(({ type }) => affectsLocalityProjection(type)))
          void invalidateVariantComparison(client, tripId);
        if (context?.sources.some(({ type }) => affectsDecisionSummary(type)))
          void invalidateVariantDecisionSummary(client, tripId);
        void refreshResearchWorkspace(client, tripId, variantId);
      }
    },
  });
}
