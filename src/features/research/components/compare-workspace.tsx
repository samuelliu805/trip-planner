"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

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
}) {
  const [sort, setSort] = useState<ResearchSort>("recent");
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
  const { items, plan: currentPlan } = workspace;
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
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              <Localized value="Ideas" />
            </h1>
          </header>
          <QuickIdeaInput items={items} onSaved={saveItem} tripId={tripId} />
          <IdeaComparisons
            context={context}
            defaultCurrency={defaultCurrencyForTrip}
            items={items}
            onSaved={saveItem}
            onSortChange={setSort}
            plan={currentPlan}
            sort={sort}
            tripId={tripId}
          />
          <ResearchItemList
            defaultCurrency={defaultCurrencyForTrip}
            items={visible}
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
              void queryClient.invalidateQueries({
                queryKey: plannerQueryKey(tripId, currentPlan.variantId),
              });
            }}
            onSaved={saveItem}
            plan={currentPlan}
            sort={sort}
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
