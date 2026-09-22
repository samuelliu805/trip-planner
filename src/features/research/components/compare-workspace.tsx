"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { IdeaDetailsEntry } from "./idea-details-entry";
import { ResearchItemList } from "./research-item-list";
import { QuickIdeaInput } from "./quick-idea-input";
import { IdeaComparisons } from "./idea-comparisons";
import { TripMobileTabBar } from "@/features/trips/components/trip-app-bar";
import { Localized } from "@/features/i18n/i18n-provider";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { researchDecisionSlotKey } from "../decision-slot";
import { isReadyToCompare } from "../readiness";
import { matchingPlanResearchItems, parseResearchCategoryRouteSegment } from "../urls";
import { researchWorkspaceQueryKey, useResearchWorkspace } from "../research-query";
import type {
  ResearchCategory,
  ResearchItem,
  ResearchPlanApplication,
  ResearchPlanSnapshot,
  ResearchSort,
  ResearchWorkspaceSnapshot,
  RevertRpcResult,
  VariantResearchSelection,
} from "../types";

export function CompareWorkspace({
  activeCategory,
  context,
  defaultCurrency,
  initialApplications,
  initialCurrentApplicationIds,
  initialItems,
  initialSelections,
  plan,
  tripId,
  variantName,
}: {
  activeCategory: ResearchCategory;
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  initialApplications: ResearchPlanApplication[];
  initialCurrentApplicationIds: string[];
  initialItems: ResearchItem[];
  initialSelections: VariantResearchSelection[];
  plan: ResearchPlanSnapshot;
  tripId: string;
  variantName: string;
}) {
  const [sort, setSort] = useState<ResearchSort>("recent");
  const [reloadNotice, setReloadNotice] = useState<string>();
  const queryClient = useQueryClient();
  const initialData = useMemo<ResearchWorkspaceSnapshot>(
    () => ({
      applications: initialApplications,
      currentApplicationIds: initialCurrentApplicationIds,
      items: initialItems,
      plan,
      selections: initialSelections,
    }),
    [initialApplications, initialCurrentApplicationIds, initialItems, initialSelections, plan],
  );
  const workspaceQuery = useResearchWorkspace(tripId, plan.variantId, initialData);
  const workspace = workspaceQuery.data ?? initialData;
  const { applications, currentApplicationIds, items, plan: currentPlan, selections } = workspace;
  const queryKey = researchWorkspaceQueryKey(tripId, plan.variantId);
  const pathname = usePathname();
  const category = parseResearchCategoryRouteSegment(pathname.split("/").at(-1)) ?? activeCategory;
  const exposureReported = useRef(false);
  useEffect(() => {
    if (exposureReported.current) return;
    exposureReported.current = true;
    captureBrowserProductEvent(
      "ideas_viewed",
      {
        ideas_category: category,
        operation_id: newTelemetryOperationId(),
        surface: "ideas_options",
      },
      { actorType: "authenticated" },
    );
  }, [category]);
  const visible =
    context?.dayId || context?.itemId
      ? matchingPlanResearchItems(items, {
          category,
          dayId: context.dayId ?? "",
          itemId: context.itemId,
          variantId: currentPlan.variantId,
        })
      : items;
  const defaultCurrencyForTrip = defaultCurrency;
  const selectionsByItem = useMemo(
    () => new Map(selections.map((selection) => [selection.research_item_id, selection])),
    [selections],
  );
  const applicationsByItem = useMemo(() => {
    const currentIds = new Set(currentApplicationIds);
    const latestBySlot = new Map<string, ResearchPlanApplication>();
    for (const application of applications) {
      if (
        application.status === "applied" &&
        currentIds.has(application.id) &&
        !latestBySlot.has(application.decision_slot_key)
      )
        latestBySlot.set(application.decision_slot_key, application);
    }
    const byItem = new Map<string, ResearchPlanApplication>();
    for (const application of latestBySlot.values())
      if (application.source_research_item_id)
        byItem.set(application.source_research_item_id, application);
    return byItem;
  }, [applications, currentApplicationIds]);

  function saveItem(saved: ResearchItem) {
    const previous = items.find((item) => item.id === saved.id);
    const decisionContextChanged =
      previous !== undefined &&
      (researchDecisionSlotKey(previous) !== researchDecisionSlotKey(saved) ||
        JSON.stringify(previous.segments) !== JSON.stringify(saved.segments));
    queryClient.setQueryData<ResearchWorkspaceSnapshot>(queryKey, (current = initialData) => ({
      ...current,
      currentApplicationIds: current.currentApplicationIds.filter(
        (applicationId) =>
          current.applications.find(({ id }) => id === applicationId)?.source_research_item_id !==
          saved.id,
      ),
      items: [saved, ...current.items.filter((item) => item.id !== saved.id)],
      selections: current.selections.filter(
        (selection) =>
          selection.research_item_id !== saved.id ||
          (isReadyToCompare(saved) && !decisionContextChanged),
      ),
    }));
    void queryClient.invalidateQueries({ queryKey });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="trip-detail-scroller min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <header className="min-w-0 py-2 sm:py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <Localized value="Ideas" />
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              <Localized value="Save ideas before you plan" />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <Localized value="Keep flights, stays, cars and activities here. Add one to Plan when you're ready." />
            </p>
          </header>
          <QuickIdeaInput items={items} onSaved={saveItem} tripId={tripId} />
          <ResearchItemList
            applicationsByItem={applicationsByItem}
            defaultCurrency={defaultCurrencyForTrip}
            items={visible}
            onApplied={(application) => {
              queryClient.setQueryData<ResearchWorkspaceSnapshot>(
                queryKey,
                (current = initialData) => ({
                  ...current,
                  applications: [
                    application,
                    ...current.applications.filter(({ id }) => id !== application.id),
                  ],
                  currentApplicationIds: [
                    application.id,
                    ...current.currentApplicationIds.filter((id) => id !== application.id),
                  ],
                }),
              );
              void queryClient.invalidateQueries({ queryKey });
              void queryClient.invalidateQueries({
                queryKey: plannerQueryKey(tripId, currentPlan.variantId),
              });
            }}
            onDeleted={(id) => {
              queryClient.setQueryData<ResearchWorkspaceSnapshot>(
                queryKey,
                (current = initialData) => ({
                  ...current,
                  applications: current.applications.map((application) =>
                    application.source_research_item_id === id
                      ? { ...application, source_research_item_id: null }
                      : application,
                  ),
                  currentApplicationIds: current.currentApplicationIds.filter(
                    (applicationId) =>
                      current.applications.find(({ id }) => id === applicationId)
                        ?.source_research_item_id !== id,
                  ),
                  items: current.items.filter((item) => item.id !== id),
                  selections: current.selections.filter(
                    (selection) => selection.research_item_id !== id,
                  ),
                }),
              );
            }}
            onReverted={(applicationId, result: RevertRpcResult) => {
              if (result.status !== "reverted") return;
              queryClient.setQueryData<ResearchWorkspaceSnapshot>(
                queryKey,
                (current = initialData) => ({
                  ...current,
                  applications: current.applications.map((application) =>
                    application.id === applicationId
                      ? { ...application, reverted_at: result.revertedAt, status: "reverted" }
                      : application,
                  ),
                  currentApplicationIds: current.currentApplicationIds.filter(
                    (id) => id !== applicationId,
                  ),
                }),
              );
              void queryClient.invalidateQueries({ queryKey });
              void queryClient.invalidateQueries({
                queryKey: plannerQueryKey(tripId, currentPlan.variantId),
              });
            }}
            onReloadLatest={async (itemId) => {
              await Promise.all([
                queryClient.invalidateQueries({ queryKey, refetchType: "active" }),
                queryClient.invalidateQueries({
                  queryKey: plannerQueryKey(tripId, currentPlan.variantId),
                  refetchType: "active",
                }),
              ]);
              const latest = queryClient.getQueryData<ResearchWorkspaceSnapshot>(queryKey);
              if (!latest?.items.some(({ id }) => id === itemId)) {
                setReloadNotice(
                  "This Research item is no longer available. Its open action was closed safely.",
                );
                return;
              }
              setReloadNotice(undefined);
            }}
            onSaved={saveItem}
            onSelected={(selection) =>
              queryClient.setQueryData<ResearchWorkspaceSnapshot>(
                queryKey,
                (current = initialData) => ({
                  ...current,
                  selections: [
                    selection,
                    ...current.selections.filter(
                      (candidate) =>
                        candidate.id !== selection.id &&
                        candidate.decision_slot_key !== selection.decision_slot_key &&
                        candidate.research_item_id !== selection.research_item_id,
                    ),
                  ],
                }),
              )
            }
            plan={currentPlan}
            selectionsByItem={selectionsByItem}
            sort={sort}
            onSortChange={setSort}
            variantName={variantName}
          />
          <IdeaComparisons items={items} plan={currentPlan} tripId={tripId} />
          <IdeaDetailsEntry
            context={context}
            defaultCurrency={defaultCurrencyForTrip}
            onSaved={saveItem}
            tripId={tripId}
          />
          {reloadNotice ? (
            <p
              className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
              role="alert"
            >
              <Localized value={reloadNotice} />
            </p>
          ) : null}
        </div>
      </div>
      <TripMobileTabBar
        active="compare"
        researchCategory={category}
        tripId={tripId}
        variantId={currentPlan.variantId}
      />
    </div>
  );
}
