"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ListOrdered, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InsertRowIcon } from "@/features/itinerary/components/insert-row-icon";
import type { PlannerCategory } from "@/features/itinerary/components/planner-config";
import type { PlannerDay } from "@/features/itinerary/types";

export function AddItemButton({
  category,
  day,
  disabled,
  onAdd,
}: {
  category: PlannerCategory;
  day: PlannerDay;
  disabled?: boolean;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  if (disabled) return null;
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
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
          type="button"
        >
          <Plus className="size-3.5" />
          <T message={" Add "} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {t("Add another {item}", { item: t(category.label.toLowerCase()) })}
      </TooltipContent>
    </Tooltip>
  );
}

export function DayActions({
  day,
  isOnlyDay,
  location,
  onArrange,
  onInsert,
  onRemove,
  pending,
  visible,
}: {
  day: PlannerDay;
  isOnlyDay: boolean;
  location: "cell" | "mobilebar";
  onArrange: (day: PlannerDay) => void;
  onInsert: (position: number) => void;
  onRemove: (dayId: string) => void;
  pending: boolean;
  visible: boolean;
}) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!visible) return null;
  const mobile = location === "mobilebar";
  const buttonClass = mobile
    ? "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-primary"
    : "flex h-9 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground";
  const insertIcon = (direction: "up" | "down") => (
    <InsertRowIcon direction={direction === "up" ? "above" : "below"} />
  );
  if (mobile)
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("Actions for Day {day}", { day: day.day_number })}
              className="flex size-11 shrink-0 items-center justify-center gap-1 rounded-md border bg-background px-0 text-xs font-semibold text-foreground min-[420px]:w-auto min-[420px]:px-3"
              type="button"
            >
              <MoreHorizontal className="size-4" />
              <span className="min-[420px]:hidden">{t("D{day}", { day: day.day_number })}</span>
              <span className="hidden min-[420px]:inline">
                <T message={"Day actions"} />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onArrange(day)}>
              <ListOrdered className="size-4" /> <T message={" Arrange Activities "} />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pending} onSelect={() => onInsert(day.day_number)}>
              {insertIcon("up")} <T message={" Add day before "} />
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onSelect={() => onInsert(day.day_number + 1)}>
              {insertIcon("down")} <T message={" Add day after "} />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={isOnlyDay || pending}
              onSelect={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-4" /> <T message={" Remove day "} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  return (
    <>
      <div
        className={
          mobile
            ? "grid w-full grid-cols-2 gap-2"
            : "mt-2 hidden grid-cols-4 overflow-hidden rounded-md border bg-background shadow-sm sm:grid"
        }
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("Arrange Day {day} Activities", { day: day.day_number })}
              className={buttonClass}
              onClick={(event) => {
                event.stopPropagation();
                onArrange(day);
              }}
              type="button"
            >
              <ListOrdered className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <T message={"Arrange Day {day} Activities"} values={{ day: day.day_number }} />
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("Insert day above Day {day}", { day: day.day_number })}
              className={buttonClass}
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onInsert(day.day_number);
              }}
              type="button"
            >
              {insertIcon("up")}
              {mobile ? (
                <span>
                  <T message={"Add day before"} />
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <T message={"Insert day above Day {day}"} values={{ day: day.day_number }} />
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("Insert day below Day {day}", { day: day.day_number })}
              className={`${buttonClass} border-l`}
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onInsert(day.day_number + 1);
              }}
              type="button"
            >
              {insertIcon("down")}
              {mobile ? (
                <span>
                  <T message={"Add day after"} />
                </span>
              ) : null}
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
              className={
                mobile
                  ? "col-span-2 flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-destructive disabled:opacity-30"
                  : "flex h-9 items-center justify-center border-l text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
              }
              disabled={isOnlyDay || pending}
              onClick={(event) => {
                event.stopPropagation();
                setConfirmOpen(true);
              }}
              type="button"
            >
              <Trash2 className="size-3.5" />
              {mobile ? (
                <span>
                  <T message={"Remove day"} />
                </span>
              ) : null}
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
