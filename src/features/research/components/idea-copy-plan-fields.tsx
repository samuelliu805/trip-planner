"use client";

import { T } from "@/features/i18n/i18n-provider";

import { ideaJourneyDates, newPlanDateRange } from "../idea-plan-dates";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { IdeaJourneyPreviewList } from "./idea-journey-preview-list";
import { PlanAnchorDaySelect } from "./plan-day-select";

export function IdeaCopyPlanFields({
  anchor,
  blank = false,
  item,
  onAnchorChange,
  plan,
}: {
  anchor: number | null;
  blank?: boolean;
  item: ResearchItem;
  onAnchorChange: (value: number) => void;
  plan: ResearchPlanSnapshot;
}) {
  const dates = ideaJourneyDates(item);
  if (!dates.length && item.start_date) dates.push(item.start_date);
  if (item.end_date && !dates.includes(item.end_date)) dates.push(item.end_date);
  dates.sort();
  const range = dates[0] ? newPlanDateRange(dates[0], anchor ?? 1, plan.days.length, dates) : null;
  return (
    <>
      <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium">
        <T
          message={blank ? "New empty Plan from: {variant}" : "Copying Plan: {variant}"}
          values={{ variant: plan.variantName }}
        />
      </p>
      {blank ? (
        <p className="text-sm text-muted-foreground">
          <T message="The new Plan starts without items. Only this idea will be added." />
        </p>
      ) : null}
      <IdeaJourneyPreviewList items={[item]} />
      {dates.length ? (
        <>
          <label className="block text-sm font-medium">
            <T message={item.category === "flight" ? "First flight on" : "Idea starts on"} />
            <PlanAnchorDaySelect days={plan.days} onChange={onAnchorChange} value={anchor} />
          </label>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            {range && anchor ? (
              <T message="Day 1: {start} · Last day: {end}" values={range} />
            ) : (
              <T message="Choose a Day to see changes." />
            )}
          </p>
        </>
      ) : (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <T message="This idea will be added to the first day of the new Plan." />
        </p>
      )}
    </>
  );
}
