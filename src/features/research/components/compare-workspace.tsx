"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { CategorySelector } from "./category-selector";
import { ResearchItemDialog } from "./research-item-dialog";
import { ResearchItemList } from "./research-item-list";
import { ResearchSortMenu } from "./research-sort-menu";
import { TripMobileTabBar } from "@/features/trips/components/trip-app-bar";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
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
  categoryHrefs,
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
  categoryHrefs: Record<ResearchCategory, string>;
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
  const [sort, setSort] = useState<ResearchSort>("price");
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
  const visible =
    context?.dayId || context?.itemId
      ? matchingPlanResearchItems(items, {
          category,
          dayId: context.dayId ?? "",
          itemId: context.itemId,
          variantId: currentPlan.variantId,
        })
      : items.filter((item) => item.category === category);
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
          <div
            aria-label="Ideas filters"
            className="flex min-w-0 items-center justify-between gap-3"
            role="region"
          >
            <div className="min-w-0">
              <CategorySelector
                active={category}
                hrefs={categoryHrefs}
                onNavigate={(nextCategory) => {
                  if (nextCategory === category) return;
                  window.history.pushState(null, "", categoryHrefs[nextCategory]);
                }}
              />
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <ResearchSortMenu onChange={setSort} value={sort} />
              <ResearchItemDialog
                category={category}
                context={context}
                defaultCurrency={defaultCurrencyForTrip}
                onSaved={saveItem}
                tripId={tripId}
              />
            </div>
          </div>
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
            variantName={variantName}
          />
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
