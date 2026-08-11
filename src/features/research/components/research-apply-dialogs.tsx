"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { formatMoney } from "../money";
import { researchCategorySingularLabels } from "../types";
import type {
  OptionImpact,
  ResearchItem,
  ResearchPlanApplication,
  RevertRpcResult,
} from "../types";

function optionContext(item: ResearchItem) {
  const place =
    item.category === "stay"
      ? item.location_text
      : [item.origin_text, item.destination_text].filter(Boolean).join(" → ");
  const dates = [item.start_date, item.end_date].filter(Boolean).join("–");
  return [place, dates].filter(Boolean).join(" · ");
}

export function ResearchApplyReviewDialog({
  error,
  impact,
  item,
  onApply,
  onOpenChange,
  onTargetChange,
  open,
  pending,
  targetChoices,
  targetItemId,
  variantName,
}: {
  error?: string;
  impact: OptionImpact;
  item: ResearchItem;
  onApply: () => void;
  onOpenChange: (open: boolean) => void;
  onTargetChange: (id: string) => void;
  open: boolean;
  pending: boolean;
  targetChoices: Array<{ date: string | null; dayNumber: number; id: string; title: string }>;
  targetItemId?: string;
  variantName: string;
}) {
  const context = optionContext(item);
  const itemType =
    researchCategorySingularLabels[item.category as keyof typeof researchCategorySingularLabels];
  const title = `Choose what to update in ${variantName}`;
  const needsTargetChoice = targetChoices.length > 1 && !targetItemId;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            We found more than one possible Plan item. Choose which one this{" "}
            {itemType.toLowerCase()}
            should replace. We’ll update the Plan for you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div>
            <p className="font-semibold">{item.title ?? item.note ?? "Selected option"}</p>
            {context ? <p className="mt-1 text-sm text-muted-foreground">{context}</p> : null}
            {item.total_price_amount !== null && item.currency ? (
              <p className="text-sm tabular-nums">
                {formatMoney(item.total_price_amount, item.currency)} · captured reference
              </p>
            ) : null}
            <p className="research-safe-wrap mt-1 text-xs text-muted-foreground">
              {item.source_url ?? "No source link saved"}
            </p>
          </div>
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Plan update
            </p>
            <p className="mt-1 font-semibold">{impact.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{impact.message}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold text-muted-foreground">Plan item</p>
              <p className="mt-1 text-sm">
                {impact.currentTitle
                  ? `${impact.currentTitle} → ${item.title}`
                  : `${item.title ?? itemType} will be added`}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold text-muted-foreground">Protected</p>
              <p className="mt-1 text-sm">
                Activities, Activity order, and saved route calculations stay unchanged.
              </p>
            </div>
          </div>
          {targetChoices.length > 1 ? (
            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-semibold">Which Plan item should be replaced?</legend>
              <p className="text-xs text-muted-foreground">
                This date contains more than one matching item. Pick the one this option replaces.
              </p>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                {targetChoices.map((choice) => (
                  <label
                    className="flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    key={choice.id}
                  >
                    <input
                      checked={targetItemId === choice.id}
                      className="size-4 shrink-0 accent-primary"
                      name="apply-target"
                      onChange={() => onTargetChange(choice.id)}
                      type="radio"
                      value={choice.id}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{choice.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        Day {choice.dayNumber}
                        {choice.date ? ` · ${choice.date}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            aria-busy={pending}
            disabled={pending || needsTargetChoice}
            onClick={onApply}
            type="button"
          >
            {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
            Apply to Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResearchApplicationDialog({
  application,
  error,
  item,
  onOpenChange,
  onRevert,
  open,
  pending,
  result,
  variantName,
}: {
  application: ResearchPlanApplication;
  error?: string;
  item: ResearchItem;
  onOpenChange: (open: boolean) => void;
  onRevert: () => void;
  open: boolean;
  pending: boolean;
  result?: RevertRpcResult;
  variantName: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {result?.status === "conflict" ? "Review Revert" : "Applied changes"}
          </DialogTitle>
          <DialogDescription>{variantName} · Durable change record</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <p className="text-sm">
            <span className="font-medium">{item.title ?? "Research option"}</span> affected{" "}
            {application.affected_entity_ids.length} saved Plan{" "}
            {application.affected_entity_ids.length === 1 ? "record" : "records"}.
          </p>
          {result?.status === "conflict" ? (
            <div
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
              role="alert"
            >
              <p className="font-semibold">Automatic Revert stopped safely.</p>
              {result.conflicts.map((conflict) => (
                <div className="mt-2" key={conflict.entityId}>
                  <p>Fields changed since Apply: {conflict.changedFields.join(", ")}</p>
                  <p>Fields safe to restore: {conflict.safeFields.join(", ") || "None"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Revert restores only fields that still match this durable Apply record.
            </p>
          )}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            Close
          </Button>
          {result?.status !== "conflict" ? (
            <Button
              aria-busy={pending}
              disabled={pending}
              onClick={onRevert}
              type="button"
              variant="destructive"
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <RotateCcw aria-hidden="true" className="size-4" />
              )}
              Revert
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
