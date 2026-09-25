"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

import { applySingleIdea, applySingleIdeaWithConfirmedCalendar } from "../idea-actions";
import { applySingleIdeaToNewVariant } from "../idea-plan-variant-actions";
import { anchoredPlanDateChange, ideaJourneyDates, newPlanDateRange } from "../idea-plan-dates";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { PlanAnchorDaySelect, PlanDaySelect } from "./plan-day-select";
import { IdeaJourneyPreviewList } from "./idea-journey-preview-list";

export function AddIdeaToPlan({ item, plan }: { item: ResearchItem; plan: ResearchPlanSnapshot }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dayId, setDayId] = useState("");
  const [beforeItemId, setBeforeItemId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [dateMode, setDateMode] = useState<"current" | "new">("current");
  const [anchorDayNumber, setAnchorDayNumber] = useState<number | null>(null);
  const matchingDay = item.start_date
    ? plan.days.find((entry) => entry.date === item.start_date)
    : undefined;
  const journeyDates = ideaJourneyDates(item);
  const needsDateDecision = journeyDates.length > 0;
  const dateChange = anchorDayNumber
    ? anchoredPlanDateChange(journeyDates, plan, anchorDayNumber)
    : null;
  const newDates = journeyDates[0]
    ? newPlanDateRange(journeyDates[0], anchorDayNumber ?? 1, plan.days.length, journeyDates)
    : null;
  const needsSchedule =
    item.category === "activity" ||
    (item.category !== "flight" &&
      item.category !== "train" &&
      Boolean(item.start_date && !matchingDay));
  const day = plan.days.find((entry) => entry.id === dayId);

  async function apply(destination: "current" | "new" = "current") {
    if (pending || (needsSchedule && !dayId) || (needsDateDecision && !anchorDayNumber)) return;
    setPending(true);
    setError(undefined);
    const input = {
      tripId: item.trip_id,
      variantId: plan.variantId,
      researchItemId: item.id,
      dayId: destination === "new" ? null : dayId || null,
      beforeItemId: destination === "new" ? null : beforeItemId || null,
      operationId: newTelemetryOperationId(),
      anchorDayNumber: anchorDayNumber ?? 1,
    };
    const result =
      destination === "new"
        ? await applySingleIdeaToNewVariant(input)
        : needsDateDecision
          ? await applySingleIdeaWithConfirmedCalendar(input)
          : await applySingleIdea(input);
    setPending(false);
    if (!result.data) {
      setError(result.error);
      return;
    }
    if (destination === "new" && "variantId" in result.data) {
      router.push(`${window.location.pathname}?variant=${result.data.variantId}`);
      router.refresh();
      return;
    }
    void queryClient.invalidateQueries({ queryKey: plannerQueryKey(item.trip_id, plan.variantId) });
    router.refresh();
    setOpen(false);
    setNotice(
      "status" in result.data && result.data.status === "already_applied"
        ? t("Already in Plan")
        : t("Added to Plan"),
    );
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
          <Button
            className="min-h-11"
            disabled={pending}
            onClick={() => {
              if (needsSchedule || needsDateDecision) {
                setDateMode("current");
                setAnchorDayNumber(null);
                setOpen(true);
                setError(undefined);
              } else void apply();
            }}
            size="sm"
            type="button"
            variant="default"
          >
            <T message="Add to Plan" />
          </Button>
        )}
        {error && !open ? (
          <span className="text-sm text-destructive" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-full overflow-x-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              <T
                message={
                  needsDateDecision
                    ? dateMode === "new"
                      ? "New Plan dates"
                      : "Update Plan dates?"
                    : "Add to Plan"
                }
              />
            </DialogTitle>
            <DialogDescription className="sr-only">
              <T message="Choose where this belongs in your Plan." />
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65dvh] space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium">
              <T
                message={
                  dateMode === "new" ? "Copying Plan: {variant}" : "Adding to Plan: {variant}"
                }
                values={{ variant: plan.variantName }}
              />
            </p>
            <IdeaJourneyPreviewList items={[item]} />
            {needsDateDecision ? (
              <label className="block text-base font-medium">
                <T message="First flight on" />
                <PlanAnchorDaySelect
                  days={plan.days}
                  onChange={setAnchorDayNumber}
                  value={anchorDayNumber}
                />
              </label>
            ) : (
              <label className="block text-sm font-medium">
                <T message="Day" />
                <PlanDaySelect
                  days={plan.days}
                  onChange={(value) => {
                    setDayId(value);
                    setBeforeItemId("");
                  }}
                  value={dayId}
                />
              </label>
            )}
            {needsDateDecision ? (
              <div className="rounded-xl bg-muted/40 px-4 py-3 text-base font-medium">
                {dateMode === "new" ? (
                  newDates && anchorDayNumber ? (
                    <T message="Day 1: {start} · Last day: {end}" values={newDates} />
                  ) : (
                    <T message="Choose a Day to see changes." />
                  )
                ) : dateChange ? (
                  <T
                    message="Plan dates: {before} → {after}"
                    values={{
                      before: dateChange.before?.join("–") ?? t("No dates"),
                      after: dateChange.after.join("–"),
                    }}
                  />
                ) : (
                  <T message="Choose a Day to see changes." />
                )}
              </div>
            ) : null}
            {!needsDateDecision &&
            day &&
            (item.category === "stay" || item.category === "activity") ? (
              <label className="block text-sm font-medium">
                <T message="Position" />
                <Select
                  onValueChange={(value) => setBeforeItemId(value === "end" ? "" : value)}
                  value={beforeItemId || "end"}
                >
                  <SelectTrigger aria-label={t("Position")} className="mt-1 bg-card font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="end">{t("At the end")}</SelectItem>
                    {day.items.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {t("Before {item}", { item: entry.title })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            {needsDateDecision ? (
              <Button
                className="min-h-11"
                disabled={pending}
                onClick={() => {
                  if (dateMode === "new") {
                    setDateMode("current");
                    setAnchorDayNumber(null);
                  } else {
                    setDateMode("new");
                    setAnchorDayNumber(1);
                  }
                  setError(undefined);
                }}
                type="button"
                variant="outline"
              >
                <T message={dateMode === "new" ? "Back" : "Copy Plan and add idea"} />
              </Button>
            ) : null}
            <Button
              className="min-h-11"
              disabled={
                (needsSchedule && !dayId) || (needsDateDecision && !anchorDayNumber) || pending
              }
              onClick={() => void apply(dateMode)}
              type="button"
            >
              <T
                message={
                  needsDateDecision
                    ? dateMode === "new"
                      ? "Create Plan"
                      : "Update this Plan"
                    : "Add to Plan"
                }
              />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
