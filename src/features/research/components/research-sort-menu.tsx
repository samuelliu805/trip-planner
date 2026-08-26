"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { ArrowUpDown, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ResearchSort } from "../types";

const labels: Record<ResearchSort, string> = {
  price: "Price",
  recent: "Recent",
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("Sort candidates: {sort}", { sort: t(labels[value]) })}
          className="size-11 shrink-0 p-0 xl:w-auto xl:px-3"
          title={t("Sort candidates: {sort}", { sort: t(labels[value]) })}
          variant="outline"
        >
          <ArrowUpDown aria-hidden="true" className="size-4" />
          <span className="hidden xl:inline">
            <Localized value={labels[value]} />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["price", "recent"] as const).map((sort) => (
          <DropdownMenuItem className="min-h-11" key={sort} onSelect={() => onChange(sort)}>
            <Check
              aria-hidden="true"
              className={`size-4 ${value === sort ? "opacity-100" : "opacity-0"}`}
            />
            <Localized value={sort === "price" ? "Sort by price" : "Most recent"} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
