"use client";
import type { QueryClient } from "@tanstack/react-query";
import type { BackgroundActionOwner } from "../editing/background-action-owner";
import type { VariantSyncRuntime } from "../variants/variant-sync-runtime";
import { pendingVariantWorkspace, sourceSnapshot } from "../variants/sync-intent";
import { plannerQueryKey } from "../itinerary/planner-query";
import type { PlannerWorkspace } from "../itinerary/types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { variantColorPalette } from "../variants/schema";
import { clonedVariantName, nextVariantName } from "../variants/default-name";
import type { ResearchItem, ResearchPlanSnapshot } from "./types";
import type { IdeaVariantPlacement } from "./idea-variant-placement";
import { ideaJourneyDates } from "./idea-plan-dates";
import { captureApplicationProjection } from "./application-projection";
import { captureOwnedSources } from "./capture-owned-sources";
import { captureOwnedVariantSource } from "../variants/enqueue-variant-creation";

export function enqueueIdeaApplication(
  owner: BackgroundActionOwner,
  client: QueryClient,
  items: ResearchItem[],
  plan: ResearchPlanSnapshot,
  placement: IdeaVariantPlacement,
  choice?: { comparisonId: string; choiceId: string },
  dependencies: string[] = [],
  beforeOverride?: string,
) {
  const workspace = client.getQueryData<PlannerWorkspace>(
    plannerQueryKey(owner.scope[2], plan.variantId),
  );
  const variant = workspace?.variant ?? plan.variant;
  if (!variant) throw new Error("Reload this Plan before applying an Idea. Your choices are kept.");
  const accepted = captureOwnedSources(owner.scope, client, items);
  items = accepted.items;
  return owner.accept(
    {
      kind: "idea.apply",
      sourceBefore: accepted.sourceBefore,
      projection: workspace
        ? captureApplicationProjection(workspace, items, {
            dayId: placement.dayId,
            beforeItemId: placement.beforeItemId,
            anchor: items.some((item) => ideaJourneyDates(item).length)
              ? placement.anchorDayNumber
              : null,
          })
        : undefined,
      before: beforeOverride ?? (workspace ? sourceSnapshot(workspace) : ""),
      input: {
        tripId: owner.scope[2],
        variantId: plan.variantId,
        operationId: newTelemetryOperationId(),
        researchItemId: choice ? null : items[0].id,
        comparisonId: choice?.comparisonId ?? null,
        choiceId: choice?.choiceId ?? null,
        dayId: placement.dayId || null,
        beforeItemId: placement.beforeItemId || null,
        anchorDayNumber: items.some((item) => ideaJourneyDates(item).length)
          ? placement.anchorDayNumber
          : null,
        expectedResearchVersions: Object.fromEntries(items.map((item) => [item.id, item.version])),
        expectedVariantVersion: variant.version,
        expectedContentVersion: variant.content_version,
        expectedDaysVersion: variant.days_version,
        expectedItemsVersion: variant.items_version,
      },
    },
    dependencies,
  );
}
export function enqueueIdeaInNewPlan(
  owner: BackgroundActionOwner,
  variants: VariantSyncRuntime,
  client: QueryClient,
  items: ResearchItem[],
  sourcePlan: ResearchPlanSnapshot,
  blank: boolean,
  anchor: number,
  locale: "en" | "zh-CN",
  choice?: { comparisonId: string; choiceId: string },
) {
  const loadedSource = client.getQueryData<PlannerWorkspace>(
    plannerQueryKey(owner.scope[2], sourcePlan.variantId),
  );
  if (!loadedSource)
    throw new Error("Load the source Plan before copying it. Your choices are kept.");
  const source = captureOwnedVariantSource(
    variants.scope,
    client,
    loadedSource,
    sourcePlan.variantId,
  );
  const rows = variants.project(),
    color = variantColorPalette.find(
      (candidate) => !rows.some((row) => row.color.toLowerCase() === candidate.value),
    )?.value;
  if (!color) throw new Error("This trip has no space for another Plan.");
  const operationId = newTelemetryOperationId();
  const intent = {
    kind: "create" as const,
    duplicate: !blank,
    source,
    input: {
      tripId: owner.scope[2],
      operationId,
      sourceVariantId: source.variant.id,
      color,
      name: blank ? nextVariantName(rows, locale) : clonedVariantName(source.variant.name, rows),
      expectedSourceVersion: source.variant.version,
      expectedSourceContentVersion: source.variant.content_version,
      expectedSourceDaysVersion: source.variant.days_version,
      expectedSourceItemsVersion: source.variant.items_version,
      dayIds: Object.fromEntries(source.days.map((day) => [day.id, newTelemetryOperationId()])),
      itemIds: blank
        ? {}
        : Object.fromEntries(
            source.days
              .flatMap((day) => day.items)
              .map((item) => [item.id, newTelemetryOperationId()]),
          ),
    },
  };
  variants.accept(intent);
  const workspace = pendingVariantWorkspace(intent);
  const applicationId = enqueueIdeaApplication(
    owner,
    client,
    items,
    { ...sourcePlan, variantId: operationId, variant: workspace.variant },
    { dayId: workspace.days[0]?.id ?? "", beforeItemId: "", anchorDayNumber: anchor },
    choice,
    [operationId],
    sourceSnapshot(workspace),
  );
  return { operationId: applicationId, variantId: operationId };
}
