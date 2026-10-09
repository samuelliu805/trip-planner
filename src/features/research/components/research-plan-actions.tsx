"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { ResearchApplicationDialog, ResearchApplyReviewDialog } from "./research-apply-dialogs";

import { useBackgroundActions } from "@/features/editing/use-background-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import { sourceSnapshot } from "@/features/variants/sync-intent";
import { archiveSyncBranch } from "@/features/editing/archive-sync-branch";
import { tripSyncQueues } from "@/features/editing/sync-registry";
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
  onReloadLatest,
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
  const owner = useBackgroundActions(item.trip_id, "idea-workflows"),
    client = useQueryClient();
  const fields = useDurableFields(
    editingStorageKey(useDraftScope(item.trip_id, plan.variantId), `booking-target:${item.id}`),
    { targetItemId: "" },
  );
  const handled = useRef(new Set<string>());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const operations =
    owner?.queue.operations.filter((op) => {
      const intent = op.intent as {
        kind: string;
        input: { researchItemId?: string; applicationId?: string };
      };
      return (
        intent.input.researchItemId === item.id ||
        Boolean(application && intent.input.applicationId === application.id)
      );
    }) ?? [];
  const pending = operations.some((op) =>
    ["queued", "sending", "acknowledged"].includes(op.status),
  );
  const failure = operations.find((op) => op.status === "failed" || op.status === "conflict");
  const [reviewed, setReviewed] = useState(false);
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
  const targetItemId = fields.values.targetItemId || undefined;
  const setTargetItemId = (value: string | undefined) => fields.set("targetItemId", value ?? "");
  const completed = owner?.completed ?? [];
  useEffect(() => {
    for (const row of completed) {
      if (handled.current.has(row.id)) continue;
      handled.current.add(row.id);
      if (row.intent.kind === "booking.apply" && row.intent.input.researchItemId === item.id) {
        void onReloadLatest().catch((error) => setError(String(error)));
      } else if (
        row.intent.kind === "booking.revert" &&
        row.intent.input.applicationId === application?.id
      ) {
        const result = (row.result as unknown as { data: RevertRpcResult }).data;
        queueMicrotask(() => {
          setRevertResult(result);
          setConflict(result.status === "conflict");
          void onReloadLatest().catch((error) => setError(String(error)));
        });
      }
    }
    // Results belong to the captured booking/application, even after its review closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed.length, item.id, application?.id]);

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
    try {
      if (!owner || fields.getError())
        throw new Error("Local storage is unavailable. Your choices are kept.");
      const workspace = client.getQueryData<PlannerWorkspace>(
        plannerQueryKey(item.trip_id, plan.variantId),
      );
      const baseline = workspace?.variant ?? plan.variant;
      if (!baseline) throw new Error("Reload the target Plan before applying this booking.");
      if (reviewed && failure?.status === "conflict") {
        const entries = tripSyncQueues(owner.scope),
          entry = entries.find((entry) => entry.queue === owner.queue);
        if (entry) archiveSyncBranch(entries, entry, failure.id);
      }
      owner.accept({
        kind: "booking.apply",
        before: workspace ? sourceSnapshot(workspace) : "",
        input: {
          category: item.category as "flight" | "rental" | "stay" | "train",
          expectedVersion: item.version,
          expectedVariantVersion: baseline.version,
          expectedContentVersion: baseline.content_version,
          expectedDaysVersion: baseline.days_version,
          expectedItemsVersion: baseline.items_version,
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
        },
      });
      setError(undefined);
      setReviewOpen(false);
      setReviewed(false);
    } catch (error) {
      setError(String(error));
    }
  }
  function revert() {
    if (!application || !owner) return;
    try {
      owner.accept({
        kind: "booking.revert",
        variantId: plan.variantId,
        input: {
          applicationId: application.id,
          category: item.category as "flight" | "rental" | "stay" | "train",
          expectedVersion: application.version,
          operationId: newTelemetryOperationId(),
          tripId: item.trip_id,
        },
      });
      setError(undefined);
      setChangesOpen(false);
    } catch (error) {
      setError(String(error));
    }
  }

  async function reloadLatest() {
    setReloadPending(true);
    try {
      await onReloadLatest();
      setReviewed(true);
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
              disabled={pending || Boolean(failure && !reviewed)}
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
      {pending ? (
        <p role="status">
          <T message="Pending sync" />
        </p>
      ) : null}
      {owner?.queue.operations.find((op) => op.error)?.error ? (
        <p role="alert">{owner.queue.operations.find((op) => op.error)!.error}</p>
      ) : null}
      {error ? (
        <p className="mt-1 text-right text-xs text-destructive" role="alert">
          <Localized value={error} />
        </p>
      ) : null}
      {conflict || failure?.status === "conflict" ? (
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
        conflict={conflict || failure?.status === "conflict"}
        impact={impact}
        item={item}
        onApply={() => void apply()}
        onOpenChange={setReviewOpen}
        onReloadLatest={reloadLatest}
        onTargetChange={setTargetItemId}
        open={reviewOpen}
        pending={false}
        reloadPending={reloadPending}
        targetChoices={targetChoices}
        targetItemId={targetItemId}
        variantName={variantName}
      />
      {application ? (
        <ResearchApplicationDialog
          application={application}
          error={error}
          conflict={conflict || failure?.status === "conflict"}
          item={item}
          onOpenChange={setChangesOpen}
          onReloadLatest={reloadLatest}
          onRevert={() => void revert()}
          open={changesOpen}
          pending={false}
          reloadPending={reloadPending}
          result={revertResult}
          variantName={variantName}
        />
      ) : null}
    </div>
  );
}
