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

import { applySingleIdea } from "../idea-actions";
import { applySingleIdeaToNewVariant } from "../idea-plan-variant-actions";
import { missingJourneyDates } from "../idea-plan-dates";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { PlanDaySelect } from "./plan-day-select";

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
  const matchingDay = item.start_date
    ? plan.days.find((entry) => entry.date === item.start_date)
    : undefined;
  const missingDates = missingJourneyDates(item, plan);
  const needsDateDecision = missingDates.length > 0;
  const needsSchedule =
    item.category === "activity" ||
    (item.category !== "flight" &&
      item.category !== "train" &&
      Boolean(item.start_date && !matchingDay));
  const day = plan.days.find((entry) => entry.id === dayId);

  async function apply(destination: "current" | "new" = "current") {
    if (pending || (needsSchedule && !dayId)) return;
    setPending(true);
    setError(undefined);
    const input = {
      tripId: item.trip_id,
      variantId: plan.variantId,
      researchItemId: item.id,
      dayId: destination === "new" ? null : dayId || null,
      beforeItemId: destination === "new" ? null : beforeItemId || null,
      operationId: newTelemetryOperationId(),
    };
    const result =
      destination === "new"
        ? await applySingleIdeaToNewVariant(input)
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <T message="Add to Plan" />
            </DialogTitle>
            <DialogDescription>
              {needsDateDecision ? (
                <T
                  message="This journey needs Plan days for {dates}. Choose where to add them."
                  values={{ dates: missingDates.join(", ") }}
                />
              ) : item.start_date ? (
                <T
                  message="This idea is dated {date}. Choose where it belongs in this Plan."
                  values={{
                    date: item.end_date ? `${item.start_date} – ${item.end_date}` : item.start_date,
                  }}
                />
              ) : (
                <T message="Choose where this belongs in your Plan." />
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4 sm:px-6">
            {needsDateDecision ? (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <T message="Update this Plan's dates, or make a copy with its own dates. Your Ideas remain available in both Plans." />
              </p>
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
                onClick={() => void apply("new")}
                type="button"
                variant="outline"
              >
                <T message="Create another Plan" />
              </Button>
            ) : null}
            <Button
              className="min-h-11"
              disabled={(needsSchedule && !dayId) || pending}
              onClick={() => void apply("current")}
              type="button"
            >
              <T message={needsDateDecision ? "Update this Plan" : "Add to Plan"} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
