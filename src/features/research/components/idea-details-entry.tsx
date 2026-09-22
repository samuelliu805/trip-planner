"use client";

import { Car, Hotel, MapPin, MoreHorizontal, Plane, Train } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { T, useI18n } from "@/features/i18n/i18n-provider";

import type { ResearchCategory, ResearchItem } from "../types";
import { ResearchItemDialog } from "./research-item-dialog";

const entries = [
  { category: "flight", Icon: Plane, label: "Flight" },
  { category: "stay", Icon: Hotel, label: "Stay" },
  { category: "train", Icon: Train, label: "Train" },
  { category: "rental", Icon: Car, label: "Car" },
  { category: "activity", Icon: MapPin, label: "Activity" },
] as const;

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
  const [open, setOpen] = useState(false);

  function add(value: ResearchCategory) {
    setCategory(value);
    window.setTimeout(() => setOpen(true), 0);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("More idea actions")}
            className="size-11 shrink-0 p-0"
            title={t("More idea actions")}
            type="button"
            variant="ghost"
          >
            <MoreHorizontal aria-hidden="true" className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {entries.map(({ category: value, Icon, label }) => (
            <DropdownMenuItem key={value} onSelect={() => add(value)}>
              <Icon aria-hidden="true" className="size-4" />
              <T message="Add {item} manually" values={{ item: t(label).toLocaleLowerCase() }} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResearchItemDialog
        category={category}
        context={context}
        defaultCurrency={defaultCurrency}
        hideTrigger
        onOpenChange={setOpen}
        onSaved={onSaved}
        open={open}
        tripId={tripId}
      />
    </>
  );
}
