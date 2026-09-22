"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
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

export function AddIdeaToPlan({ item, plan }: { item: ResearchItem; plan: ResearchPlanSnapshot }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dayId, setDayId] = useState("");
  const [beforeItemId, setBeforeItemId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const needsSchedule = item.category === "activity";
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
      {error && !open ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
      {notice ? (
        <span className="text-xs text-emerald-700" role="status">
          {notice}
        </span>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <T message="Add activity to Plan" />
            </DialogTitle>
            <DialogDescription>
              <T message="Choose a day and where it should appear. The saved idea will remain in Ideas." />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4 sm:px-6">
            <label className="block text-sm font-medium">
              <T message="Day" />
              <select
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"
                onChange={(event) => {
                  setDayId(event.target.value);
                  setBeforeItemId("");
                }}
                value={dayId}
              >
                <option value="">{t("Choose a day")}</option>
                {plan.days.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {t("Day {number}", { number: entry.dayNumber })}
                    {entry.date ? ` · ${entry.date}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {day ? (
              <label className="block text-sm font-medium">
                <T message="Position" />
                <select
                  className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"
                  onChange={(event) => setBeforeItemId(event.target.value)}
                  value={beforeItemId}
                >
                  <option value="">{t("At the end")}</option>
                  {day.items.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {t("Before {item}", { item: entry.title })}
                    </option>
                  ))}
                </select>
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
