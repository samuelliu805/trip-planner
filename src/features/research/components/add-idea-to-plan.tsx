"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { tripSectionHref } from "../urls";

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

import { useBackgroundActions } from "@/features/editing/use-background-actions";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { LocalDraftStatus } from "@/features/editing/local-draft-status";
import { useVariantSync } from "@/features/variants/use-variant-sync";
import { loadPlannerWorkspace } from "@/features/itinerary/actions";
import { findPlannerRuntime } from "@/features/itinerary/planner-runtime-owner";
import { enqueueIdeaApplication, enqueueIdeaInNewPlan } from "../enqueue-idea-workflow";
import { ideaJourneyDates } from "../idea-plan-dates";
import { loadIdeaVariantPlans } from "../idea-variant-plan-actions";
import {
  initialIdeaVariantPlacement,
  placementReady,
  type IdeaVariantPlacement,
} from "../idea-variant-placement";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { IdeaCopyPlanFields } from "./idea-copy-plan-fields";
import { IdeaApplyFooter, type IdeaApplyMode } from "./idea-apply-footer";
import { IdeaVariantTargetList, type IdeaApplyResult } from "./idea-variant-target-list";

export function AddIdeaToPlan({ item, plan }: { item: ResearchItem; plan: ResearchPlanSnapshot }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const owner = useBackgroundActions(item.trip_id, "idea-workflows");
  const variants = useVariantSync(item.trip_id, plan.variant ? [plan.variant] : []);
  const fields = useDurableFields(
    editingStorageKey(useDraftScope(item.trip_id, plan.variantId), `idea-apply:${item.id}`),
    {
      selectedIds: [plan.variantId],
      placements: {} as Record<string, IdeaVariantPlacement>,
      mode: "existing" as IdeaApplyMode,
      copyAnchor: null as number | null,
    },
  );
  const { selectedIds, placements, mode, copyAnchor } = fields.values;
  const setSelectedIds = (value: SetStateAction<string[]>) => fields.set("selectedIds", value);
  const setPlacements = (value: SetStateAction<Record<string, IdeaVariantPlacement>>) =>
    fields.set("placements", value);
  const setMode = (value: IdeaApplyMode) => fields.set("mode", value);
  const setCopyAnchor = (value: number | null) => fields.set("copyAnchor", value);
  const requestGeneration = useRef(0);
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState([plan]);
  const [loading, setLoading] = useState(false);
  const results: Record<string, IdeaApplyResult> = {};
  for (const row of owner?.completed ?? [])
    if (row.intent.kind === "idea.apply" && row.intent.input.researchItemId === item.id)
      results[row.intent.input.variantId] = {
        status:
          (row.result as { data: { status: string } }).data.status === "already_applied"
            ? "already_applied"
            : "applied",
      };
  for (const op of owner?.queue.operations ?? []) {
    const intent = op.intent as {
      kind: string;
      input: { researchItemId?: string; variantId: string };
    };
    if (intent.kind === "idea.apply" && intent.input.researchItemId === item.id)
      results[intent.input.variantId] = { error: op.error, status: "queued" };
  }
  const pending = false;
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
    Boolean(owner) &&
    !fields.error &&
    !pending &&
    !loading &&
    !error &&
    selectedPlans.length > 0 &&
    remainingPlans.every((candidate) =>
      placementReady(
        item,
        candidate,
        placements[candidate.variantId] ?? initialIdeaVariantPlacement(item, candidate),
      ),
    );

  async function showDialog() {
    setOpen(true);
    setLoading(true);
    const request = ++requestGeneration.current;
    setError(undefined);
    try {
      const loaded = await loadIdeaVariantPlans(item.trip_id);
      if (!loaded.data) setError(loaded.error);
      else if (request === requestGeneration.current) setPlans(loaded.data);
      const key = plannerQueryKey(item.trip_id, plan.variantId);
      if (!queryClient.getQueryData(key)) {
        const loaded = await loadPlannerWorkspace(item.trip_id, plan.variantId);
        if (loaded.data) {
          const runtime = findPlannerRuntime([
            process.env.NEXT_PUBLIC_APP_REGION ?? "global",
            owner?.scope[1] ?? "",
            item.trip_id,
            plan.variantId,
          ]);
          if (runtime) runtime.attach(queryClient, loaded.data);
          else queryClient.setQueryData(key, loaded.data);
        }
      }
    } catch {
      setError(t("Plans could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  function applyToSelected() {
    if (!canApply || !owner || !remainingPlans.length) return;
    try {
      for (const candidate of remainingPlans)
        enqueueIdeaApplication(
          owner,
          queryClient,
          [item],
          candidate,
          placements[candidate.variantId] ?? initialIdeaVariantPlacement(item, candidate),
        );
      setOpen(false);
      setNotice(t("Saved locally"));
      if (remainingPlans.length === 1)
        router.push(tripSectionHref(item.trip_id, "plan", remainingPlans[0].variantId));
    } catch (error) {
      setError(String(error));
    }
  }
  function applyToNew() {
    if (!owner || !variants || !copyAnchor || fields.getError()) return;
    try {
      const accepted = enqueueIdeaInNewPlan(
        owner,
        variants,
        queryClient,
        [item],
        plan,
        mode === "blank",
        copyAnchor,
        locale,
      );
      setOpen(false);
      setNotice(t("Saved locally"));
      router.push(tripSectionHref(item.trip_id, "plan", accepted.variantId));
    } catch (error) {
      setError(String(error));
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
      <Dialog open={open} onOpenChange={setOpen}>
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
          <div className="px-5">
            <LocalDraftStatus
              draft={fields}
              onDiscard={() => {
                fields.discard();
                setOpen(false);
              }}
            />
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
