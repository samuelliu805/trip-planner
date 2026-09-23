"use client";

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
import { missingJourneyDates } from "../idea-plan-dates";
import { activityNeedsDay, choiceLabel, itemLabel } from "./idea-comparison-labels";
import { PlanDaySelect } from "./plan-day-select";

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
  onApply: (comparison: IdeaComparison, choiceId: string, destination?: "current" | "new") => void;
  onClose: () => void;
  onDayChange: (choiceId: string, dayId: string) => void;
  pending: boolean;
  plan: ResearchPlanSnapshot;
  view?: IdeaComparison;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={!!view} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{view?.title}</DialogTitle>
          <DialogDescription>
            <T message="Choose one to put into your current Plan." />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4 sm:px-6">
          {view?.choices.map((choice) => {
            const selectedItems = choice.itemIds
              .map((id) => byId.get(id))
              .filter((item): item is ResearchItem => !!item);
            const flightDates = [
              ...new Set(selectedItems.flatMap((item) => missingJourneyDates(item, plan))),
            ].sort();
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
                {flightDates.length ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("This journey needs Plan days for {dates}. Choose where to add them.", {
                      dates: flightDates.join(", "),
                    })}
                  </p>
                ) : null}
                {flightDates.length && !needsDay ? (
                  <Button
                    className="mt-3 min-h-11 w-full sm:w-auto"
                    disabled={pending}
                    onClick={() => view && onApply(view, choice.id, "new")}
                    type="button"
                    variant="outline"
                  >
                    <T message="Create another Plan" />
                  </Button>
                ) : null}
                <Button
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  disabled={
                    pending ||
                    selectedItems.length !== choice.itemIds.length ||
                    (needsDay && !dayIds[choice.id])
                  }
                  onClick={() => view && onApply(view, choice.id, "current")}
                  type="button"
                >
                  <T message={flightDates.length ? "Update this Plan" : "Use this"} />
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
