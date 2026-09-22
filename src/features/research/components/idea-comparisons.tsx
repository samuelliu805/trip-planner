"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import {
  applyIdeaChoice,
  createIdeaComparison,
  deleteIdeaComparison,
  loadIdeaComparisons,
  type IdeaComparison,
} from "../idea-actions";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { activityNeedsDay } from "./idea-comparison-labels";
import { IdeaComparisonCreateDialog } from "./idea-comparison-create-dialog";
import { IdeaComparisonViewDialog } from "./idea-comparison-view-dialog";
import { IdeaComparisonDeleteDialog } from "./idea-comparison-delete-dialog";

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
  items,
  plan,
  tripId,
}: {
  items: ResearchItem[];
  plan: ResearchPlanSnapshot;
  tripId: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [comparisons, setComparisons] = useState<IdeaComparison[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<IdeaComparison>();
  const [deleting, setDeleting] = useState<IdeaComparison>();
  const [title, setTitle] = useState("");
  const [choices, setChoices] = useState<string[][]>([[], []]);
  const [dayId, setDayId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const refresh = useCallback(async () => {
    const result = await loadIdeaComparisons(tripId);
    if (result.data) {
      setComparisons(result.data);
      setError(undefined);
    } else setError(result.error);
  }, [tripId]);
  useEffect(() => {
    let active = true;
    void loadIdeaComparisons(tripId).then((result) => {
      if (!active) return;
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

  async function create() {
    if (pending || choices.length < 2 || choices.some((choice) => !choice.length)) return;
    setPending(true);
    setError(undefined);
    const operationId = newTelemetryOperationId();
    const result = await createIdeaComparison({
      tripId,
      title: title.trim() || defaultTitle(choices, items, t),
      choices,
    });
    setPending(false);
    if (!result.data) {
      setError(result.error);
      return;
    }
    captureBrowserProductEvent(
      "comparison_created",
      {
        operation_id: operationId,
        surface: "ideas_comparison",
      },
      { actorType: "authenticated" },
    );
    setCreateOpen(false);
    setTitle("");
    setChoices([[], []]);
    await refresh();
  }

  async function apply(comparison: IdeaComparison, choiceId: string) {
    if (pending) return;
    const choice = comparison.choices.find((entry) => entry.id === choiceId);
    if (!choice) return;
    const needsDay = choice.itemIds.some((id) => {
      const item = byId.get(id);
      return item ? activityNeedsDay(item, plan) : false;
    });
    if (needsDay && !dayId) {
      setError(t("Choose a day for the activity."));
      return;
    }
    setPending(true);
    setError(undefined);
    const operationId = newTelemetryOperationId();
    const result = await applyIdeaChoice({
      comparisonId: comparison.id,
      choiceId,
      dayId: dayId || null,
      operationId,
      tripId,
      variantId: plan.variantId,
    });
    setPending(false);
    if (!result.data) {
      setError(result.error);
      return;
    }
    captureBrowserProductEvent(
      result.data.switched ? "comparison_choice_switched" : "comparison_choice_applied",
      {
        operation_id: operationId,
        surface: "ideas_comparison",
      },
      { actorType: "authenticated" },
    );
    void queryClient.invalidateQueries({ queryKey: plannerQueryKey(tripId, plan.variantId) });
    setView(undefined);
    setNotice(t("Added to Plan. Other choices stay here, so you can switch later."));
  }

  async function removeComparison() {
    if (!deleting || pending) return;
    setPending(true);
    setError(undefined);
    const result = await deleteIdeaComparison({
      tripId,
      comparisonId: deleting.id,
      operationId: newTelemetryOperationId(),
    });
    setPending(false);
    if (!result.data) {
      setError(result.error);
      return;
    }
    setComparisons((current) => current.filter((entry) => entry.id !== deleting.id));
    setDeleting(undefined);
    setNotice(t("Comparison deleted. Saved ideas and Plan items remain."));
  }

  return (
    <section
      aria-label={t("Comparisons")}
      className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            <T message="Comparisons" />
          </h2>
          <p className="text-sm text-muted-foreground">
            <T message="When you're undecided, put saved ideas into choices." />
          </p>
        </div>
        <Button
          className="min-h-11"
          onClick={() => {
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
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" className="size-4" /> <T message="New comparison" />
        </Button>
      </div>
      {comparisons.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {comparisons.map((comparison) => (
            <div className="flex min-w-0 items-center gap-1" key={comparison.id}>
              <Button
                className="min-h-14 h-auto min-w-0 flex-1 justify-start text-left"
                onClick={() => {
                  setError(undefined);
                  setDayId("");
                  setView(comparison);
                }}
                type="button"
                variant="outline"
              >
                <span className="min-w-0 truncate">{comparison.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("{count} choices", { count: comparison.choices.length })}
                </span>
              </Button>
              <Button
                aria-label={t("Delete comparison {title}", { title: comparison.title })}
                className="size-11 shrink-0 p-0"
                onClick={() => {
                  setError(undefined);
                  setDeleting(comparison);
                }}
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          <T message="No comparisons yet." />
        </p>
      )}
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
        dayId={dayId}
        error={view ? error : undefined}
        onApply={(comparison, choiceId) => void apply(comparison, choiceId)}
        onClose={() => setView(undefined)}
        onDayChange={setDayId}
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
