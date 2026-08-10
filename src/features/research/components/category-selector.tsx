"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { nativeSelectClass } from "./form-controls";
import { MobileCategoryPicker } from "./mobile-category-picker";
import { researchCategories, researchCategoryLabels, type ResearchCategory } from "../types";

export function CategorySelector({
  active,
  hrefs,
}: {
  active: ResearchCategory;
  hrefs: Record<ResearchCategory, string>;
}) {
  const router = useRouter();

  return (
    <>
      <MobileCategoryPicker active={active} hrefs={hrefs} />
      <label className="hidden w-28 min-w-0 sm:block lg:hidden">
        <span className="sr-only">Price category</span>
        <select
          aria-label="Price category"
          className={nativeSelectClass}
          onChange={(event) => router.push(hrefs[event.target.value as ResearchCategory])}
          value={active}
        >
          {researchCategories.map((category) => (
            <option key={category} value={category}>
              {researchCategoryLabels[category]}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label="Price categories" className="hidden grid-cols-4 gap-1.5 lg:grid">
        {researchCategories.map((category) => (
          <Link
            aria-current={active === category ? "page" : undefined}
            className={`flex min-h-11 min-w-20 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors ${
              active === category
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
            href={hrefs[category]}
            key={category}
          >
            {researchCategoryLabels[category]}
          </Link>
        ))}
      </nav>
    </>
  );
}
