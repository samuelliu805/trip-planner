"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

import { applySingleIdea, applySingleIdeaWithConfirmedCalendar } from "../idea-actions";
import {
  applySingleIdeaToBlankVariant,
  applySingleIdeaToNewVariant,
} from "../idea-plan-variant-actions";
import { ideaJourneyDates } from "../idea-plan-dates";
import { loadIdeaVariantPlans } from "../idea-variant-plan-actions";
import {
  emptyIdeaVariantPlacement,
  placementReady,
  type IdeaVariantPlacement,
} from "../idea-variant-placement";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { IdeaCopyPlanFields } from "./idea-copy-plan-fields";
import { IdeaApplyFooter, type IdeaApplyMode } from "./idea-apply-footer";
import { IdeaVariantTargetList, type IdeaApplyResult } from "./idea-variant-target-list";

export function AddIdeaToPlan({ item, plan }: { item: ResearchItem; plan: ResearchPlanSnapshot }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const operationIds = useRef<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState([plan]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([plan.variantId]);
  const [placements, setPlacements] = useState<Record<string, IdeaVariantPlacement>>({});
  const [results, setResults] = useState<Record<string, IdeaApplyResult>>({});
  const [mode, setMode] = useState<IdeaApplyMode>("existing");
  const [copyAnchor, setCopyAnchor] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(undefined), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const journeyDates = ideaJourneyDates(item);
  const selectedPlans = plans.filter((candidate) => selectedIds.includes(candidate.variantId));
  const remainingPlans = selectedPlans.filter((candidate) => !results[candidate.variantId]?.status);
  const canApply =
    !pending &&
    !loading &&
    !error &&
    selectedPlans.length > 0 &&
    remainingPlans.every((candidate) =>
      placementReady(
        item,
        candidate,
        placements[candidate.variantId] ?? emptyIdeaVariantPlacement(),
      ),
    );

  async function showDialog() {
    setOpen(true);
    setLoading(true);
    setPlans([plan]);
    setSelectedIds([plan.variantId]);
    setPlacements({});
    setResults({});
    setMode("existing");
    setCopyAnchor(null);
    setError(undefined);
    operationIds.current = {};
    try {
      const loaded = await loadIdeaVariantPlans(item.trip_id);
      if (!loaded.data) setError(loaded.error);
      else setPlans(loaded.data);
    } catch {
      setError(t("Plans could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  async function applyToSelected() {
    if (!canApply || !remainingPlans.length) return;
    setPending(true);
    setError(undefined);
    let failed = false;
    for (const candidate of remainingPlans) {
      const placement = placements[candidate.variantId] ?? emptyIdeaVariantPlacement();
      const operationId = operationIds.current[candidate.variantId] ?? newTelemetryOperationId();
      operationIds.current[candidate.variantId] = operationId;
      const input = {
        tripId: item.trip_id,
        variantId: candidate.variantId,
        researchItemId: item.id,
        dayId: placement.dayId || null,
        beforeItemId: placement.beforeItemId || null,
        operationId,
      };
      try {
        const result = journeyDates.length
          ? await applySingleIdeaWithConfirmedCalendar({
              ...input,
              anchorDayNumber: placement.anchorDayNumber!,
            })
          : await applySingleIdea(input);
        if (!result.data) {
          failed = true;
          setResults((current) => ({
            ...current,
            [candidate.variantId]: { error: result.error },
          }));
        } else {
          setResults((current) => ({
            ...current,
            [candidate.variantId]: {
              status: result.data.status === "already_applied" ? "already_applied" : "applied",
            },
          }));
          void queryClient.invalidateQueries({
            queryKey: plannerQueryKey(item.trip_id, candidate.variantId),
          });
        }
      } catch {
        failed = true;
        setResults((current) => ({
          ...current,
          [candidate.variantId]: { error: t("The idea could not be added to Plan.") },
        }));
      }
    }
    setPending(false);
    if (failed) return;
    setOpen(false);
    setNotice(
      selectedPlans.length === 1
        ? t("Added to Plan")
        : t("Added to {count} Plans", { count: selectedPlans.length }),
    );
    router.refresh();
  }

  async function applyToNew() {
    if (pending || !copyAnchor) return;
    setPending(true);
    setError(undefined);
    try {
      const create = mode === "blank" ? applySingleIdeaToBlankVariant : applySingleIdeaToNewVariant;
      const result = await create({
        tripId: item.trip_id,
        variantId: plan.variantId,
        researchItemId: item.id,
        anchorDayNumber: copyAnchor,
        operationId: newTelemetryOperationId(),
      });
      if (!result.data) setError(result.error);
      else {
        setOpen(false);
        window.location.assign(`${window.location.pathname}?variant=${result.data.variantId}`);
      }
    } catch {
      setError(t("The new Plan could not be created."));
    } finally {
      setPending(false);
    }
  }

  function changeMode(next: IdeaApplyMode) {
    setMode(next);
    setCopyAnchor(next === "existing" ? null : 1);
    setError(undefined);
  }

  return (
    <>
      <div className="flex min-h-11 shrink-0 items-center justify-end gap-2">
        {notice ? (
          <span
            className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-medium text-emerald-700"
            role="status"
          >
            <Check aria-hidden="true" className="size-4" />
            {notice}
          </span>
        ) : (
          <Button className="min-h-11" onClick={() => void showDialog()} size="sm" type="button">
            <T message="Add to Plan" />
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="max-w-full overflow-x-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              <T
                message={
                  mode !== "existing"
                    ? journeyDates.length || item.start_date
                      ? "New Plan dates"
                      : "Create empty Plan + idea"
                    : journeyDates.length
                      ? "Update Plan dates?"
                      : "Add to Plan"
                }
              />
            </DialogTitle>
            <DialogDescription className="sr-only">
              <T message="Choose where this belongs in your Plan." />
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65dvh] space-y-4 overflow-x-hidden overflow-y-auto px-5 py-4 sm:px-6">
            {mode === "existing" ? (
              <IdeaVariantTargetList
                item={item}
                loading={loading}
                onPlacementChange={(variantId, placement) =>
                  setPlacements((current) => ({ ...current, [variantId]: placement }))
                }
                onSelectedChange={(variantId, selected) =>
                  setSelectedIds((current) =>
                    selected ? [...current, variantId] : current.filter((id) => id !== variantId),
                  )
                }
                placements={placements}
                plans={plans}
                results={results}
                selectedIds={selectedIds}
                variantName={plan.variantName}
              />
            ) : (
              <IdeaCopyPlanFields
                anchor={copyAnchor}
                blank={mode === "blank"}
                item={item}
                onAnchorChange={setCopyAnchor}
                plan={plan}
              />
            )}
            {error && (mode !== "existing" || !loading) ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <IdeaApplyFooter
            canApply={canApply}
            copyAnchor={copyAnchor}
            journeyDateCount={journeyDates.length}
            mode={mode}
            onApply={() => void (mode !== "existing" ? applyToNew() : applyToSelected())}
            onModeChange={changeMode}
            pending={pending}
            remainingCount={remainingPlans.length}
            retrying={Object.values(results).some((result) => result.status)}
            selectedCount={selectedPlans.length}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
