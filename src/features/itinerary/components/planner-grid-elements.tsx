"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { InsertRowIcon } from "@/features/itinerary/components/insert-row-icon";
import type { PlannerDay } from "@/features/itinerary/types";

export function DayActions({
  day,
  onInsert,
  pending,
  visible,
}: {
  day: PlannerDay;
  onInsert: (position: number) => void;
  pending: boolean;
  visible: boolean;
}) {
  const { t } = useI18n();
  if (!visible) return null;
  const addDay = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onInsert(day.day_number + 1);
  };
  return (
    <div className="mt-auto flex min-w-0 pt-2">
      <Button
        aria-label={t("Insert day below Day {day}", { day: day.day_number })}
        className="min-h-11 min-w-0 flex-1 gap-1.5 px-2 font-sans text-[13px]"
        data-add-day=""
        disabled={pending}
        onClick={addDay}
        size="sm"
        type="button"
      >
        <InsertRowIcon className="size-4 shrink-0" direction="below" />
        <span className="whitespace-nowrap">
          <T message={"Add day"} />
        </span>
      </Button>
    </div>
  );
}
