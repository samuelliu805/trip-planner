"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PlannerCategory } from "@/features/itinerary/components/planner-config";
import type { PlannerDay } from "@/features/itinerary/types";

export function AddItemButton({
  category,
  day,
  disabled,
  newTripStarter = false,
  onAdd,
}: {
  category: PlannerCategory;
  day: PlannerDay;
  disabled?: boolean;
  newTripStarter?: boolean;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  if (disabled) return null;
  const add = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onAdd();
  };

  if (newTripStarter)
    return (
      <div
        className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-left"
        data-empty-trip-actions=""
      >
        <div className="px-1">
          <p className="text-sm font-semibold text-foreground">
            <T message={" Start planning "} />
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            <T message={" Add your first activity. "} />
          </p>
        </div>
        <Button className="min-h-11 w-full" data-add-item onClick={add} size="sm" type="button">
          <Plus aria-hidden="true" className="size-4" /> <T message={" Add activity "} />
        </Button>
      </div>
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={t("Add {item} on day {day}", {
            day: day.day_number,
            item: t(category.label.toLowerCase()),
          })}
          className="mt-auto flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded border border-dashed bg-background text-xs font-medium text-muted-foreground min-[1200px]:text-[13px] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-add-item
          onClick={add}
          type="button"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          <T message={" Add "} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {t("Add another {item}", { item: t(category.label.toLowerCase()) })}
      </TooltipContent>
    </Tooltip>
  );
}
