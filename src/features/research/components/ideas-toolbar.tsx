"use client";

import { GitCompareArrows } from "lucide-react";

import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";

import type { ResearchItem, ResearchSort } from "../types";
import { IdeaDetailsEntry } from "./idea-details-entry";
import { ResearchSortMenu } from "./research-sort-menu";

export function IdeasToolbar({
  context,
  defaultCurrency,
  itemCount,
  onCompare,
  onSaved,
  onSortChange,
  sort,
  tripId,
}: {
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  itemCount: number;
  onCompare: () => void;
  onSaved: (item: ResearchItem) => void;
  onSortChange: (sort: ResearchSort) => void;
  sort: ResearchSort;
  tripId: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-1 border-b pb-2">
      <h2 className="mr-auto text-lg font-semibold">
        <T message="Saved ideas" />
      </h2>
      {itemCount > 1 ? <ResearchSortMenu onChange={onSortChange} value={sort} /> : null}
      <Button
        aria-label={t("Compare ideas")}
        className="min-h-11"
        disabled={itemCount < 2}
        onClick={onCompare}
        type="button"
        variant="ghost"
      >
        <GitCompareArrows aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">
          <T message="Compare" />
        </span>
      </Button>
      <IdeaDetailsEntry
        context={context}
        defaultCurrency={defaultCurrency}
        onSaved={onSaved}
        tripId={tripId}
      />
    </div>
  );
}
