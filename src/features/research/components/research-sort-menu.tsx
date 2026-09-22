"use client";

import { ArrowUpDown, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="min-h-11" type="button" variant="ghost">
          <ArrowUpDown aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">{t(labels[value])}</span>
          <span className="sr-only sm:hidden">{t("Sort saved ideas")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["recent", "price"] as const).map((sort) => (
          <DropdownMenuItem key={sort} onSelect={() => onChange(sort)}>
            <Check aria-hidden="true" className={value === sort ? "size-4" : "size-4 opacity-0"} />
            {t(labels[sort])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
