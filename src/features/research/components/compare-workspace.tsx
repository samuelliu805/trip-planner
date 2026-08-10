"use client";

import { useState } from "react";

import { CategorySelector } from "./category-selector";
import { ResearchItemDialog } from "./research-item-dialog";
import { ResearchItemList } from "./research-item-list";
import { ResearchSortMenu } from "./research-sort-menu";
import type { ResearchCategory, ResearchItem, ResearchSort } from "../types";

export function CompareWorkspace({
  activeCategory,
  categoryHrefs,
  context,
  defaultCurrency,
  initialItems,
  tripId,
  tripTitle,
}: {
  activeCategory: ResearchCategory;
  categoryHrefs: Record<ResearchCategory, string>;
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  initialItems: ResearchItem[];
  tripId: string;
  tripTitle: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [sort, setSort] = useState<ResearchSort>("price");
  const visible = items.filter((item) => {
    if (item.category !== activeCategory) return false;
    if (context?.itemId) return item.itinerary_item_id === context.itemId;
    if (context?.dayId) return item.day_id === context.dayId && !item.itinerary_item_id;
    return true;
  });
  const defaultCurrencyForTrip = items.find((item) => item.currency)?.currency ?? defaultCurrency;

  function saveItem(saved: ResearchItem) {
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
  }

  return (
    <div className="space-y-4">
      <header className="flex min-h-11 min-w-0 items-center gap-2" aria-label="Compare controls">
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-semibold">{tripTitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="sm:hidden">Plan unchanged</span>
            <span className="hidden sm:inline">{visible.length} saved · Plan unchanged</span>
          </p>
        </div>
        <div className="flex min-w-0 flex-none items-center gap-2">
          <CategorySelector active={activeCategory} hrefs={categoryHrefs} />
          <ResearchSortMenu onChange={setSort} value={sort} />
          <ResearchItemDialog
            category={activeCategory}
            context={context}
            defaultCurrency={defaultCurrencyForTrip}
            onSaved={saveItem}
            tripId={tripId}
          />
        </div>
      </header>
      <ResearchItemList
        defaultCurrency={defaultCurrencyForTrip}
        items={visible}
        onDeleted={(id) => setItems((current) => current.filter((item) => item.id !== id))}
        onSaved={saveItem}
        sort={sort}
      />
    </div>
  );
}
