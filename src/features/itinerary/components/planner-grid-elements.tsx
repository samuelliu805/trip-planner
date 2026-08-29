"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InsertRowIcon } from "@/features/itinerary/components/insert-row-icon";
import type { PlannerDay } from "@/features/itinerary/types";

export function DayActions({
  day,
  isOnlyDay,
  onInsert,
  onRemove,
  pending,
  visible,
}: {
  day: PlannerDay;
  isOnlyDay: boolean;
  onInsert: (position: number) => void;
  onRemove: (dayId: string) => void;
  pending: boolean;
  visible: boolean;
}) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!visible) return null;
  const addDay = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onInsert(day.day_number + 1);
  };
  if (isOnlyDay)
    return (
      <Button
        aria-label={t("Insert day below Day {day}", { day: day.day_number })}
        className="mt-2 min-h-11 w-full gap-1 px-1 text-xs"
        disabled={pending}
        onClick={addDay}
        size="sm"
        type="button"
      >
        <InsertRowIcon direction="below" />
        <T message={"Add day"} />
      </Button>
    );
  const buttonClass =
    "flex min-h-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground sm:min-h-9";
  return (
    <>
      <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-md border bg-background shadow-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("Insert day below Day {day}", { day: day.day_number })}
              className={buttonClass}
              disabled={pending}
              onClick={addDay}
              type="button"
            >
              <InsertRowIcon direction="below" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <T message={"Insert day below Day {day}"} values={{ day: day.day_number }} />
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("Remove Day {day}", { day: day.day_number })}
              className={`${buttonClass} border-l hover:bg-destructive/10 hover:text-destructive disabled:opacity-30`}
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                setConfirmOpen(true);
              }}
              type="button"
            >
              <Trash2 className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <T message={"Remove Day {day}"} values={{ day: day.day_number }} />
          </TooltipContent>
        </Tooltip>
      </div>
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <T message={"Remove Day {day}"} values={{ day: day.day_number }} />?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <T
                message={
                  " This also deletes every itinerary item in this day. The remaining days and dates will be renumbered automatically. "
                }
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <T message={"Keep day"} />
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => onRemove(day.id)}>
              <T message={"Remove day"} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
