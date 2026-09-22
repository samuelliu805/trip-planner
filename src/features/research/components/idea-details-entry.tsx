"use client";

import { useState } from "react";

import { T, useI18n } from "@/features/i18n/i18n-provider";

import { BookingSitesDialog } from "./booking-sites-dialog";
import { ResearchItemDialog } from "./research-item-dialog";
import type { ResearchCategory, ResearchItem } from "../types";

const categories: ResearchCategory[] = ["flight", "stay", "train", "rental", "activity"];
const labels: Record<ResearchCategory, string> = {
  flight: "Flight",
  stay: "Stay",
  train: "Train",
  rental: "Car",
  activity: "Activity",
};

export function IdeaDetailsEntry({
  context,
  defaultCurrency,
  onSaved,
  tripId,
}: {
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  onSaved: (item: ResearchItem) => void;
  tripId: string;
}) {
  const { t } = useI18n();
  const [category, setCategory] = useState<ResearchCategory>("flight");

  return (
    <details className="group rounded-xl border bg-card px-4 py-3">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold marker:text-primary">
        <T message="Add details manually" />
      </summary>
      <div className="flex flex-wrap items-end gap-3 border-t pt-3">
        <label className="min-w-0 flex-1 text-sm font-medium sm:max-w-52">
          <T message="Type of idea" />
          <select
            className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
            onChange={(event) => setCategory(event.target.value as ResearchCategory)}
            value={category}
          >
            {categories.map((value) => (
              <option key={value} value={value}>
                {t(labels[value])}
              </option>
            ))}
          </select>
        </label>
        <ResearchItemDialog
          category={category}
          context={context}
          defaultCurrency={defaultCurrency}
          onSaved={onSaved}
          tripId={tripId}
        />
        {category !== "activity" ? <BookingSitesDialog category={category} toolbar /> : null}
      </div>
    </details>
  );
}
