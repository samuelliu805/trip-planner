"use client";

import { Check } from "lucide-react";
import { useState } from "react";
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
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { PlanDaySelect } from "./plan-day-select";

export function AddIdeaToPlan({ item, plan }: { item: ResearchItem; plan: ResearchPlanSnapshot }) {
  const { t } = useI18n();
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
  const needsSchedule = item.category === "activity" || Boolean(item.start_date && !matchingDay);
  const day = plan.days.find((entry) => entry.id === dayId);

  async function apply() {
    if (pending || (needsSchedule && !dayId)) return;
    setPending(true);
    setError(undefined);
    const result = await applySingleIdea({
      tripId: item.trip_id,
      variantId: plan.variantId,
      researchItemId: item.id,
      dayId: dayId || null,
      beforeItemId: beforeItemId || null,
      operationId: newTelemetryOperationId(),
    });
    setPending(false);
    if (!result.data) {
      setError(result.error);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: plannerQueryKey(item.trip_id, plan.variantId) });
    setOpen(false);
    setNotice(result.data.status === "already_applied" ? t("Already in Plan") : t("Added to Plan"));
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
              if (needsSchedule) {
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
              {item.start_date ? (
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
            {day ? (
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
            <Button
              className="min-h-11"
              disabled={!dayId || pending}
              onClick={() => void apply()}
              type="button"
            >
              <T message="Add to Plan" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
