"use client";

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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Sort candidates: ${labels[value]}`}
          className="size-11 shrink-0 p-0 xl:w-auto xl:px-3"
          title={`Sort candidates: ${labels[value]}`}
          variant="outline"
        >
          <ArrowUpDown aria-hidden="true" className="size-4" />
          <span className="hidden xl:inline">{labels[value]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["price", "recent"] as const).map((sort) => (
          <DropdownMenuItem className="min-h-11" key={sort} onSelect={() => onChange(sort)}>
            <Check
              aria-hidden="true"
              className={`size-4 ${value === sort ? "opacity-100" : "opacity-0"}`}
            />
            {sort === "price" ? "Sort by price" : "Most recent"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
