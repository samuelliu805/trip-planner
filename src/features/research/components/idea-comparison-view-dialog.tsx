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
import { activityNeedsDay, choiceLabel, itemLabel } from "./idea-comparison-labels";

export function IdeaComparisonViewDialog({
  byId,
  dayId,
  error,
  onApply,
  onClose,
  onDayChange,
  pending,
  plan,
  view,
}: {
  byId: ReadonlyMap<string, ResearchItem>;
  dayId: string;
  error?: string;
  onApply: (comparison: IdeaComparison, choiceId: string) => void;
  onClose: () => void;
  onDayChange: (dayId: string) => void;
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
            const needsDay = selectedItems.some((item) => activityNeedsDay(item, plan));
            const dateMismatch = selectedItems.some(
              (item) => item.start_date && !plan.days.some((day) => day.date === item.start_date),
            );
            return (
              <article className="rounded-xl border p-3" key={choice.id}>
                <h3 className="font-semibold">
                  {t("Choice {letter}", { letter: choiceLabel(choice.position) })}
                </h3>
                <ul className="mt-2 space-y-2">
                  {selectedItems.map((item) => (
                    <li className="text-sm" key={item.id}>
                      <strong className="break-words">{itemLabel(item)}</strong>
                      <p className="text-xs text-muted-foreground">
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
                {dateMismatch ? (
                  <p className="mt-2 text-xs text-amber-700">
                    <T message="Some dates do not match a Plan day. Those ideas will be placed on the selected day or the first day." />
                  </p>
                ) : null}
                {needsDay ? (
                  <label className="mt-3 block text-sm">
                    <T message="Day for undated activities" />
                    <select
                      className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"
                      onChange={(event) => onDayChange(event.target.value)}
                      value={dayId}
                    >
                      <option value="">{t("Choose a day")}</option>
                      {plan.days.map((day) => (
                        <option key={day.id} value={day.id}>
                          {t("Day {number}", { number: day.dayNumber })}
                          {day.date ? ` · ${day.date}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <Button
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  disabled={
                    pending ||
                    selectedItems.length !== choice.itemIds.length ||
                    (needsDay && !dayId)
                  }
                  onClick={() => view && onApply(view, choice.id)}
                  type="button"
                >
                  <T message="Use this" />
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
