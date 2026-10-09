"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useI18n } from "@/features/i18n/i18n-provider";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { loadIdeaComparisons, type IdeaComparison } from "../idea-actions";
import { useBackgroundActions } from "@/features/editing/use-background-actions";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { useVariantSync } from "@/features/variants/use-variant-sync";
import { loadPlannerWorkspace } from "@/features/itinerary/actions";
import { enqueueIdeaApplication, enqueueIdeaInNewPlan } from "../enqueue-idea-workflow";
import type { ResearchItem, ResearchPlanSnapshot, ResearchSort } from "../types";
import { activityNeedsDay } from "./idea-comparison-labels";
import { IdeaComparisonCreateDialog } from "./idea-comparison-create-dialog";
import { IdeaComparisonViewDialog } from "./idea-comparison-view-dialog";
import { IdeaComparisonDeleteDialog } from "./idea-comparison-delete-dialog";
import { IdeasToolbar } from "./ideas-toolbar";
import { IdeaComparisonList } from "./idea-comparison-list";

function defaultTitle(choices: string[][], items: ResearchItem[], t: (value: string) => string) {
  const selected = new Set(choices.flat());
  const categories = new Set(
    items.filter((item) => selected.has(item.id)).map((item) => item.category),
  );
  const category = categories.size === 1 ? [...categories][0] : null;
  if (category === "flight") return t("Flight comparison");
  if (category === "stay") return t("Stay comparison");
  if (category === "rental") return t("Car comparison");
  if (category === "activity") return t("Activity comparison");
  return t("New comparison");
}

export function IdeaComparisons({
  context,
  defaultCurrency,
  items,
  onSaved,
  onSortChange,
  plan,
  sort,
  tripId,
}: {
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  items: ResearchItem[];
  onSaved: (item: ResearchItem) => void;
  onSortChange: (sort: ResearchSort) => void;
  plan: ResearchPlanSnapshot;
  sort: ResearchSort;
  tripId: string;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const owner = useBackgroundActions(tripId, "idea-workflows"),
    variants = useVariantSync(tripId, plan.variant ? [plan.variant] : []);
  const fields = useDurableFields(
    editingStorageKey(useDraftScope(tripId, plan.variantId), "comparison"),
    { title: "", choices: [[], []] as string[][], dayIds: {} as Record<string, string> },
  );
  const { title, choices, dayIds } = fields.values;
  const setTitle = (value: string) => fields.set("title", value);
  const setChoices = (value: SetStateAction<string[][]>) => fields.set("choices", value);
  const setDayIds = (value: SetStateAction<Record<string, string>>) => fields.set("dayIds", value);
  const generation = useRef(0),
    handled = useRef(new Set<string>());
  const [comparisons, setComparisons] = useState<IdeaComparison[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<IdeaComparison>();
  const [deleting, setDeleting] = useState<IdeaComparison>();
  const pending = false;
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const result = await loadIdeaComparisons(tripId);
    if (request !== generation.current) return;
    if (result.data) {
      setComparisons(result.data);
      setError(undefined);
    } else setError(result.error);
  }, [tripId]);
  useEffect(() => {
    let active = true;
    const request = ++generation.current;
    void loadIdeaComparisons(tripId).then((result) => {
      if (!active || request !== generation.current) return;
      if (result.data) {
        setComparisons(result.data);
        setError(undefined);
      } else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [tripId]);

  function toggle(itemId: string, index: number) {
    setChoices((current) =>
      current.map((ids, position) =>
        position !== index
          ? ids
          : ids.includes(itemId)
            ? ids.filter((id) => id !== itemId)
            : [...ids, itemId],
      ),
    );
  }

  const completed = owner?.completed ?? [];
  useEffect(() => {
    const fresh = completed.filter((row) => !handled.current.has(row.id));
    if (!fresh.length) return;
    fresh.forEach((row) => handled.current.add(row.id));
    if (fresh.some((row) => row.intent.kind.startsWith("comparison."))) void refresh();
  }, [completed.length, refresh]);
  useEffect(() => {
    const key = plannerQueryKey(tripId, plan.variantId);
    if (queryClient.getQueryData(key)) return;
    let current = true;
    void loadPlannerWorkspace(tripId, plan.variantId).then((result) => {
      if (current && result.data && !queryClient.getQueryData(key))
        queryClient.setQueryData(key, result.data);
    });
    return () => {
      current = false;
    };
  }, [queryClient, tripId, plan.variantId]);
  function create() {
    if (
      !owner ||
      fields.getError() ||
      choices.length < 2 ||
      choices.some((choice) => !choice.length)
    )
      return;
    try {
      owner.accept({
        kind: "comparison.create",
        input: {
          tripId,
          title: title.trim() || defaultTitle(choices, items, t),
          choices,
          operationId: newTelemetryOperationId(),
        },
      });
      setCreateOpen(false);
      setNotice(t("Saved locally"));
      // Only this accepted draft is reset. Later input never waits on its ACK.
      fields.set("title", "");
      fields.set("choices", [[], []]);
      fields.discard();
    } catch (error) {
      setError(String(error));
    }
  }
  function apply(
    comparison: IdeaComparison,
    choiceId: string,
    destination: "current" | "new" | "blank" = "current",
    anchorDayNumber = 1,
  ) {
    if (!owner || !variants || fields.getError()) return;
    const choice = comparison.choices.find((entry) => entry.id === choiceId);
    if (!choice) return;
    const selected = choice.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is ResearchItem => Boolean(item));
    if (selected.length !== choice.itemIds.length) {
      setError(t("The choice could not be loaded."));
      return;
    }
    const dayId = dayIds[choiceId] ?? "";
    if (
      destination === "current" &&
      selected.some((item) => activityNeedsDay(item, plan)) &&
      !dayId
    ) {
      setError(t("Choose a Plan day."));
      return;
    }
    try {
      const identity = { comparisonId: comparison.id, choiceId };
      if (destination === "current")
        enqueueIdeaApplication(
          owner,
          queryClient,
          selected,
          plan,
          { dayId, beforeItemId: "", anchorDayNumber },
          identity,
        );
      else
        enqueueIdeaInNewPlan(
          owner,
          variants,
          queryClient,
          selected,
          plan,
          destination === "blank",
          anchorDayNumber,
          locale,
          identity,
        );
      setView(undefined);
      setNotice(t("Saved locally"));
    } catch (error) {
      setError(String(error));
    }
  }
  function removeComparison() {
    if (!deleting || !owner) return;
    try {
      owner.accept({
        kind: "comparison.delete",
        input: { tripId, comparisonId: deleting.id, operationId: newTelemetryOperationId() },
      });
      setDeleting(undefined);
      setNotice(t("Saved locally"));
    } catch (error) {
      setError(String(error));
    }
  }

  return (
    <section aria-label={t("Saved ideas")} className="min-w-0 space-y-3">
      <IdeasToolbar
        context={context}
        defaultCurrency={defaultCurrency}
        itemCount={items.length}
        onCompare={() => {
          setCreateOpen(true);
          setError(undefined);
          captureBrowserProductEvent(
            "comparison_creation_started",
            {
              operation_id: newTelemetryOperationId(),
              surface: "ideas_comparison",
            },
            { actorType: "authenticated" },
          );
        }}
        onSaved={onSaved}
        onSortChange={onSortChange}
        sort={sort}
        tripId={tripId}
      />
      <IdeaComparisonList
        comparisons={comparisons}
        onView={(comparison) => {
          setError(undefined);
          setDayIds({});
          setView(comparison);
        }}
        onDelete={(comparison) => {
          setError(undefined);
          setDeleting(comparison);
        }}
      />
      {notice ? (
        <p className="text-sm text-emerald-700" role="status">
          {notice}
        </p>
      ) : null}
      {error && !createOpen && !view ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <IdeaComparisonCreateDialog
        choices={choices}
        error={createOpen ? error : undefined}
        items={items}
        onCreate={() => void create()}
        onOpenChange={setCreateOpen}
        onTitleChange={setTitle}
        onToggle={toggle}
        open={createOpen}
        pending={pending}
        setChoices={setChoices}
        title={title}
      />
      <IdeaComparisonViewDialog
        byId={byId}
        dayIds={dayIds}
        error={view ? error : undefined}
        onApply={(comparison, choiceId, destination, anchorDayNumber) =>
          void apply(comparison, choiceId, destination, anchorDayNumber)
        }
        onClose={() => setView(undefined)}
        onDayChange={(choiceId, dayId) =>
          setDayIds((current) => ({ ...current, [choiceId]: dayId }))
        }
        pending={pending}
        plan={plan}
        view={view}
      />
      <IdeaComparisonDeleteDialog
        comparison={deleting}
        error={deleting ? error : undefined}
        onClose={() => setDeleting(undefined)}
        onDelete={() => void removeComparison()}
        pending={pending}
      />
    </section>
  );
}
