"use client";

import { T } from "@/features/i18n/i18n-provider";

import { ideaJourneyDates, newPlanDateRange } from "../idea-plan-dates";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { IdeaJourneyPreviewList } from "./idea-journey-preview-list";
import { PlanAnchorDaySelect } from "./plan-day-select";

export function IdeaCopyPlanFields({
  anchor,
  item,
  onAnchorChange,
  plan,
}: {
  anchor: number | null;
  item: ResearchItem;
  onAnchorChange: (value: number) => void;
  plan: ResearchPlanSnapshot;
}) {
  const dates = ideaJourneyDates(item);
  const range = dates[0] ? newPlanDateRange(dates[0], anchor ?? 1, plan.days.length, dates) : null;
  return (
    <>
      <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium">
        <T message="Copying Plan: {variant}" values={{ variant: plan.variantName }} />
      </p>
      <IdeaJourneyPreviewList items={[item]} />
      <label className="block text-sm font-medium">
        <T message="First flight on" />
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
  );
}
