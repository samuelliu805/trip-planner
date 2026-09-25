"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { T, useI18n } from "@/features/i18n/i18n-provider";

import type { IdeaComparison } from "../idea-actions";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { anchoredPlanDateChange, ideaJourneyDates, newPlanDateRange } from "../idea-plan-dates";
import { activityNeedsDay, choiceLabel, itemLabel } from "./idea-comparison-labels";
import { PlanAnchorDaySelect, PlanDaySelect } from "./plan-day-select";
import { IdeaJourneyPreviewList } from "./idea-journey-preview-list";

export function IdeaComparisonViewDialog({
  byId,
  dayIds,
  error,
  onApply,
  onClose,
  onDayChange,
  pending,
  plan,
  view,
}: {
  byId: ReadonlyMap<string, ResearchItem>;
  dayIds: Record<string, string>;
  error?: string;
  onApply: (
    comparison: IdeaComparison,
    choiceId: string,
    destination?: "current" | "new",
    anchorDayNumber?: number,
  ) => void;
  onClose: () => void;
  onDayChange: (choiceId: string, dayId: string) => void;
  pending: boolean;
  plan: ResearchPlanSnapshot;
  view?: IdeaComparison;
}) {
  const { t } = useI18n();
  const [newPlanChoiceId, setNewPlanChoiceId] = useState<string>();
  const [anchorDays, setAnchorDays] = useState<Record<string, number>>({});
  function close() {
    setNewPlanChoiceId(undefined);
    setAnchorDays({});
    onClose();
  }
  return (
    <Dialog open={!!view} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-full overflow-x-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{view?.title}</DialogTitle>
          <DialogDescription className="sr-only">
            <T message="Choose one to put into a Plan." />
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65dvh] space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
          {view?.choices.map((choice) => {
            const selectedItems = choice.itemIds
              .map((id) => byId.get(id))
              .filter((item): item is ResearchItem => !!item);
            const journeyDates = selectedItems.flatMap(ideaJourneyDates).sort();
            const anchorDayNumber = anchorDays[choice.id];
            const dateChange = anchorDayNumber
              ? anchoredPlanDateChange(journeyDates, plan, anchorDayNumber)
              : null;
            const isNewPlan = newPlanChoiceId === choice.id;
            const newDates = journeyDates[0]
              ? newPlanDateRange(
                  journeyDates[0],
                  anchorDayNumber ?? 1,
                  plan.days.length,
                  journeyDates,
                )
              : null;
            const dateMismatch = selectedItems.some(
              (item) =>
                item.category !== "flight" &&
                item.category !== "train" &&
                item.start_date &&
                !plan.days.some((day) => day.date === item.start_date),
            );
            const needsDay =
              dateMismatch || selectedItems.some((item) => activityNeedsDay(item, plan));
            return (
              <article className="rounded-xl bg-muted/35 p-4" key={choice.id}>
                <h3 className="text-base font-semibold">
                  {t("Choice {letter}", { letter: choiceLabel(choice.position) })}
                </h3>
                <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium">
                  <T
                    message={isNewPlan ? "Copying Plan: {variant}" : "Adding to Plan: {variant}"}
                    values={{ variant: plan.variantName }}
                  />
                </p>
                <ul className="mt-2 space-y-2">
                  {selectedItems.map((item) => (
                    <li className="text-sm" key={item.id}>
                      <strong className="break-words">{itemLabel(item)}</strong>
                      <p className="text-sm text-muted-foreground">
                        {[
                          item.start_date,
                          item.end_date,
                          item.origin_text && item.destination_text
                            ? `${item.origin_text} → ${item.destination_text}`
                            : item.location_text,
                          item.total_price_amount != null && item.currency
                            ? `${item.total_price_amount} ${item.currency}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <IdeaJourneyPreviewList items={selectedItems} />
                </div>
                {needsDay ? (
                  <label className="mt-3 block text-sm font-medium">
                    <T message="Plan day" />
                    <PlanDaySelect
                      days={plan.days}
                      onChange={(dayId) => onDayChange(choice.id, dayId)}
                      value={dayIds[choice.id] ?? ""}
                    />
                  </label>
                ) : null}
                {journeyDates.length ? (
                  <div className="mt-3 space-y-2">
                    <label className="block text-base font-medium">
                      <T message="First flight on" />
                      <PlanAnchorDaySelect
                        days={plan.days}
                        onChange={(dayNumber) =>
                          setAnchorDays((current) => ({ ...current, [choice.id]: dayNumber }))
                        }
                        value={anchorDayNumber ?? null}
                      />
                    </label>
                    <p className="rounded-xl bg-card px-3 py-2 text-base font-medium">
                      {isNewPlan && newDates && anchorDayNumber
                        ? t("Day 1: {start} · Last day: {end}", newDates)
                        : !isNewPlan && dateChange
                          ? t("Plan dates: {before} → {after}", {
                              before: dateChange.before?.join("–") ?? t("No dates"),
                              after: dateChange.after.join("–"),
                            })
                          : t("Choose a Day to see changes.")}
                    </p>
                  </div>
                ) : null}
                {journeyDates.length && !needsDay ? (
                  <Button
                    className="mt-3 min-h-11 w-full sm:w-auto"
                    disabled={pending}
                    onClick={() => {
                      setNewPlanChoiceId(isNewPlan ? undefined : choice.id);
                      setAnchorDays((current) => ({
                        ...current,
                        [choice.id]: isNewPlan ? 0 : 1,
                      }));
                    }}
                    type="button"
                    variant="outline"
                  >
                    <T message={isNewPlan ? "Back" : "Copy Plan and add idea"} />
                  </Button>
                ) : null}
                <Button
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  disabled={
                    pending ||
                    selectedItems.length !== choice.itemIds.length ||
                    (needsDay && !dayIds[choice.id]) ||
                    (journeyDates.length > 0 && !anchorDayNumber)
                  }
                  onClick={() =>
                    view && onApply(view, choice.id, isNewPlan ? "new" : "current", anchorDayNumber)
                  }
                  type="button"
                >
                  <T
                    message={
                      isNewPlan
                        ? "Create Plan"
                        : journeyDates.length
                          ? "Update this Plan"
                          : "Use this"
                    }
                  />
                </Button>
              </article>
            );
          })}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
