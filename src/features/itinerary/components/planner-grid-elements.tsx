"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { MoreHorizontal, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  return (
    <>
      <div className="mt-auto flex min-w-0 gap-1 pt-2">
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
        {!isOnlyDay ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t("Day {day} actions", { day: day.day_number })}
                    className="size-11 shrink-0 p-0"
                    data-day-menu=""
                    disabled={pending}
                    onClick={(event) => event.stopPropagation()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <T message={"Day actions"} />
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onSelect={() => setConfirmOpen(true)}
              >
                <Trash2 className="size-4" />
                <T message={"Remove Day {day}"} values={{ day: day.day_number }} />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
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
