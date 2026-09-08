"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { ResearchApplicationDialog, ResearchApplyReviewDialog } from "./research-apply-dialogs";

import { applyResearchItem, revertResearchApplication } from "../plan-actions";
import { deriveOptionImpact } from "../option-impact";
import type {
  ResearchItem,
  ResearchPlanApplication,
  ResearchPlanItem,
  ResearchPlanSnapshot,
  RevertRpcResult,
  VariantResearchSelection,
} from "../types";

function planItemMode(details: ResearchPlanItem["details"]) {
  return details && typeof details === "object" && !Array.isArray(details) && "mode" in details
    ? details.mode
    : undefined;
}

export function ResearchPlanActions({
  application,
  item,
  onApplied,
  onReverted,
  onReloadLatest,
  onSelected,
  plan,
  variantName,
}: {
  application?: ResearchPlanApplication;
  item: ResearchItem;
  onApplied: (application: ResearchPlanApplication) => void;
  onReverted: (applicationId: string, result: RevertRpcResult) => void;
  onReloadLatest: () => Promise<void>;
  onSelected: (selection: VariantResearchSelection) => void;
  plan: ResearchPlanSnapshot;
  variantName: string;
}) {
  const router = useRouter();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);
  const [revertResult, setRevertResult] = useState<RevertRpcResult>();
  const impact = deriveOptionImpact(item, plan);
  const targetChoices =
    item.category === "flight" || item.category === "train"
      ? plan.days.flatMap((day) =>
          day.items
            .filter(
              (entry) =>
                (day.date === item.start_date ||
                  (item.category === "flight" && day.dayNumber === 1) ||
                  entry.id === item.itinerary_item_id) &&
                (entry.type === item.category ||
                  (entry.type === "transport" && planItemMode(entry.details) === item.category)),
            )
            .map((entry) => ({
              date: day.date,
              dayNumber: day.dayNumber,
              id: entry.id,
              title: entry.title,
            })),
        )
      : [];
  const [targetItemId, setTargetItemId] = useState<string>();

  function review() {
    setError(undefined);
    const resolvedTarget = targetChoices.some(({ id }) => id === item.itinerary_item_id)
      ? (item.itinerary_item_id ?? undefined)
      : targetChoices.length === 1
        ? targetChoices[0].id
        : undefined;
    setTargetItemId(resolvedTarget);
    if (targetChoices.length > 1) setReviewOpen(true);
    else void apply(resolvedTarget);
  }

  async function apply(resolvedTargetId = targetItemId) {
    const operationId = newTelemetryOperationId();
    captureBrowserProductEvent(
      "research_apply_started",
      {
        ideas_category: item.category as "flight" | "rental" | "stay" | "train",
        operation_id: operationId,
        surface: "research_editor",
      },
      { actorType: "authenticated" },
    );
    setPending(true);
    setError(undefined);
    setConflict(false);
    const result = await applyResearchItem({
      category: item.category as "flight" | "rental" | "stay" | "train",
      expectedVersion: item.version,
      operationId,
      researchItemId: item.id,
      scheduleChoice:
        impact.planAction === "remove_days_first" &&
        plan.days
          .slice(Math.max(1, plan.days.length + impact.dayDelta))
          .some((day) => day.items.length)
          ? "keep_extra_days"
          : "automatic",
      targetItemId: resolvedTargetId,
      tripId: item.trip_id,
      variantId: plan.variantId,
    });
    setPending(false);
    if (result.error || !result.data) {
      setConflict(result.code === "conflict");
      return setError(result.error ?? "The option was not applied.");
    }
    onSelected(result.data.selection);
    onApplied(result.data.application);
    setReviewOpen(false);
    router.refresh();
  }

  async function revert() {
    if (!application) return;
    const operationId = newTelemetryOperationId();
    captureBrowserProductEvent(
      "research_revert_started",
      {
        ideas_category: item.category as "flight" | "rental" | "stay" | "train",
        operation_id: operationId,
        surface: "research_editor",
      },
      { actorType: "authenticated" },
    );
    setPending(true);
    setError(undefined);
    setConflict(false);
    const result = await revertResearchApplication({
      applicationId: application.id,
      category: item.category as "flight" | "rental" | "stay" | "train",
      expectedVersion: application.version,
      operationId,
      tripId: item.trip_id,
    });
    setPending(false);
    if (result.error || !result.data) {
      setConflict(result.code === "conflict");
      return setError(result.error ?? "The change was not reverted.");
    }
    setRevertResult(result.data);
    setConflict(result.data.status === "conflict");
    onReverted(application.id, result.data);
    if (result.data.status === "reverted") {
      setChangesOpen(false);
      router.refresh();
    }
  }

  async function reloadLatest() {
    setReloadPending(true);
    try {
      await onReloadLatest();
      setConflict(false);
      setError(undefined);
      setRevertResult(undefined);
    } finally {
      setReloadPending(false);
    }
  }

  return (
    <div className="w-full min-w-0 sm:w-auto">
      <div className="flex min-h-11 w-full items-center justify-end gap-1.5">
        {application ? (
          <>
            <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-blue-100 px-2.5 text-xs font-semibold text-blue-800">
              <Check aria-hidden="true" className="size-3.5" /> <T message={" Applied to "} />
              {variantName}
            </span>
            <Button
              className="min-h-11 px-3 text-xs"
              onClick={() => setChangesOpen(true)}
              size="sm"
              variant="outline"
            >
              <T message={" View changes "} />
            </Button>
          </>
        ) : (
          <>
            <Button
              className="min-h-11 flex-1 px-4 text-sm sm:flex-none"
              disabled={pending}
              onClick={review}
              size="sm"
              variant="default"
            >
              {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
              <Localized value={pending ? "Applying…" : "Apply to Plan"} />
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p className="mt-1 text-right text-xs text-destructive" role="alert">
          <Localized value={error} />
        </p>
      ) : null}
      {conflict ? (
        <Button
          className="mt-2 min-h-11 w-full sm:w-auto"
          disabled={reloadPending}
          onClick={() => void reloadLatest()}
          type="button"
          variant="outline"
        >
          <Localized value={reloadPending ? "Loading…" : "Reload latest"} />
        </Button>
      ) : null}

      <ResearchApplyReviewDialog
        error={error}
        conflict={conflict}
        impact={impact}
        item={item}
        onApply={() => void apply()}
        onOpenChange={setReviewOpen}
        onReloadLatest={reloadLatest}
        onTargetChange={setTargetItemId}
        open={reviewOpen}
        pending={pending}
        reloadPending={reloadPending}
        targetChoices={targetChoices}
        targetItemId={targetItemId}
        variantName={variantName}
      />
      {application ? (
        <ResearchApplicationDialog
          application={application}
          error={error}
          conflict={conflict}
          item={item}
          onOpenChange={setChangesOpen}
          onReloadLatest={reloadLatest}
          onRevert={() => void revert()}
          open={changesOpen}
          pending={pending}
          reloadPending={reloadPending}
          result={revertResult}
          variantName={variantName}
        />
      ) : null}
    </div>
  );
}
