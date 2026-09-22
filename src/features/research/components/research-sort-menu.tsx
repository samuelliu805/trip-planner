"use client";

import { useI18n } from "@/features/i18n/i18n-provider";

import type { ResearchSort } from "../types";

const labels: Record<ResearchSort, string> = {
  price: "Sort by price",
  recent: "Most recent",
};

export function ResearchSortMenu({
  onChange,
  value,
}: {
  onChange: (value: ResearchSort) => void;
  value: ResearchSort;
}) {
  const { t } = useI18n();
  return (
    <div
      aria-label={t("Sort saved ideas")}
      className="flex min-w-0 w-full rounded-xl border border-border bg-card p-1 shadow-sm sm:w-auto sm:shrink-0"
      role="group"
    >
      {(["recent", "price"] as const).map((sort) => (
        <button
          aria-pressed={value === sort}
          className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:flex-none ${
            value === sort
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          key={sort}
          onClick={() => onChange(sort)}
          type="button"
        >
          {t(labels[sort])}
        </button>
      ))}
    </div>
  );
}
