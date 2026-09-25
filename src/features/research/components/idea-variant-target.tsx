"use client";

import { Check } from "lucide-react";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { anchoredPlanDateChange, ideaJourneyDates } from "../idea-plan-dates";
import type { IdeaVariantPlacement } from "../idea-variant-placement";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { PlanAnchorDaySelect, PlanDaySelect } from "./plan-day-select";

export function IdeaVariantTarget({
  item,
  onPlacementChange,
  onSelectedChange,
  placement,
  plan,
  result,
  selected,
}: {
  item: ResearchItem;
  onPlacementChange: (next: IdeaVariantPlacement) => void;
  onSelectedChange: (selected: boolean) => void;
  placement: IdeaVariantPlacement;
  plan: ResearchPlanSnapshot;
  result?: { error?: string; status?: "applied" | "already_applied" };
  selected: boolean;
}) {
  const { t } = useI18n();
  const journeyDates = ideaJourneyDates(item);
  const dateChange = placement.anchorDayNumber
    ? anchoredPlanDateChange(journeyDates, plan, placement.anchorDayNumber)
    : null;
  const day = plan.days.find((entry) => entry.id === placement.dayId);
  return (
    <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-4">
      <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3">
        <input
          aria-label={t("Apply to {variant}", { variant: plan.variantName })}
          checked={selected}
          className="size-5 shrink-0 accent-primary"
          data-variant-id={plan.variantId}
          disabled={Boolean(result?.status)}
          onChange={(event) => onSelectedChange(event.target.checked)}
          type="checkbox"
        />
        <span className="min-w-0 flex-1 break-words font-semibold">{plan.variantName}</span>
        {result?.status ? (
          <span className="flex shrink-0 items-center gap-1 text-sm text-emerald-700">
            <Check aria-hidden="true" className="size-4" />
            <T
              message={result.status === "already_applied" ? "Already in Plan" : "Added to Plan"}
            />
          </span>
        ) : null}
      </label>
      {selected && !result?.status ? (
        <div className="min-w-0 space-y-3 pt-2">
          {journeyDates.length ? (
            <>
              <label className="block text-sm font-medium">
                <T message="First flight on" />
                <PlanAnchorDaySelect
                  days={plan.days}
                  onChange={(anchorDayNumber) =>
                    onPlacementChange({ ...placement, anchorDayNumber })
                  }
                  value={placement.anchorDayNumber}
                />
              </label>
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                {dateChange ? (
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
              </p>
            </>
          ) : (
            <label className="block text-sm font-medium">
              <T message="Day" />
              <PlanDaySelect
                days={plan.days}
                onChange={(dayId) => onPlacementChange({ ...placement, beforeItemId: "", dayId })}
                value={placement.dayId}
              />
            </label>
          )}
          {!journeyDates.length &&
          day &&
          (item.category === "stay" || item.category === "activity") ? (
            <label className="block text-sm font-medium">
              <T message="Position" />
              <Select
                onValueChange={(value) =>
                  onPlacementChange({ ...placement, beforeItemId: value === "end" ? "" : value })
                }
                value={placement.beforeItemId || "end"}
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
        </div>
      ) : null}
      {result?.error ? (
        <p className="pt-2 text-sm text-destructive" role="alert">
          {result.error}
        </p>
      ) : null}
    </section>
  );
}
