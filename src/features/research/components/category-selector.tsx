"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import Link from "next/link";

import { nativeSelectClass } from "./form-controls";
import { MobileCategoryPicker } from "./mobile-category-picker";
import { researchCategories, researchCategoryLabels, type ResearchCategory } from "../types";

export function CategorySelector({
  active,
  hrefs,
  onNavigate,
}: {
  active: ResearchCategory;
  hrefs: Record<ResearchCategory, string>;
  onNavigate: (category: ResearchCategory) => void;
}) {
  return (
    <>
      <MobileCategoryPicker active={active} hrefs={hrefs} onNavigate={onNavigate} />
      <label className="hidden w-28 min-w-0 sm:block lg:hidden">
        <span className="sr-only">
          <T message={"Price category"} />
        </span>
        <select
          aria-label="Price category"
          data-i18n-aria-label="Price category"
          className={nativeSelectClass}
          onChange={(event) => onNavigate(event.target.value as ResearchCategory)}
          value={active}
        >
          {researchCategories.map((category) => (
            <option key={category} value={category}>
              <Localized value={researchCategoryLabels[category]} />
            </option>
          ))}
        </select>
      </label>
      <nav
        aria-label="Price categories"
        data-i18n-aria-label={"Price categories"}
        className="hidden grid-cols-4 gap-1 rounded-xl bg-muted/70 p-1 lg:grid"
      >
        {researchCategories.map((category) => (
          <Link
            aria-current={active === category ? "page" : undefined}
            className={`flex min-h-11 min-w-20 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors ${
              active === category
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            }`}
            href={hrefs[category]}
            key={category}
            onClick={(event) => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                return;
              event.preventDefault();
              onNavigate(category);
            }}
            prefetch={false}
          >
            <Localized value={researchCategoryLabels[category]} />
          </Link>
        ))}
      </nav>
    </>
  );
}
