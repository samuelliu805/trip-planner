"use client";

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
  if (disabled) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`Add ${category.label.toLowerCase()} on day ${day.day_number}`}
          className="mt-auto flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded border border-dashed bg-background text-xs font-medium text-muted-foreground min-[1200px]:text-[13px] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-add-item
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
          type="button"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </TooltipTrigger>
      <TooltipContent>{`Add another ${category.label.toLowerCase()}`}</TooltipContent>
    </Tooltip>
  );
}

function InsertRowIcon({ direction }: { direction: "above" | "below" }) {
  return direction === "above" ? (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 sm:size-3.5"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 3V9M9 6H15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M5 13H19M5 17H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 sm:size-3.5"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 7H19M5 11H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M12 15V21M9 18H15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
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
              aria-label={`Actions for Day ${day.day_number}`}
              className="flex size-11 shrink-0 items-center justify-center gap-1 rounded-md border bg-background px-0 text-xs font-semibold text-foreground min-[420px]:w-auto min-[420px]:px-3"
              type="button"
            >
              <MoreHorizontal className="size-4" />
              <span className="min-[420px]:hidden">D{day.day_number}</span>
              <span className="hidden min-[420px]:inline">Day actions</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onArrange(day)}>
              <ListOrdered className="size-4" /> Arrange Activities
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pending} onSelect={() => onInsert(day.day_number)}>
              {insertIcon("up")} Add day before
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onSelect={() => onInsert(day.day_number + 1)}>
              {insertIcon("down")} Add day after
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={isOnlyDay || pending}
              onSelect={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-4" /> Remove day
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Day {day.day_number}?</AlertDialogTitle>
              <AlertDialogDescription>
                This also deletes every itinerary item in this day. The remaining days and dates
                will be renumbered automatically.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep day</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRemove(day.id)}>Remove day</AlertDialogAction>
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
              aria-label={`Arrange Day ${day.day_number} Activities`}
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
          <TooltipContent>Arrange Day {day.day_number} Activities</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Insert day above day ${day.day_number}`}
              className={buttonClass}
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onInsert(day.day_number);
              }}
              type="button"
            >
              {insertIcon("up")}
              {mobile ? <span>Add day before</span> : null}
            </button>
          </TooltipTrigger>
          <TooltipContent>Insert a new day above Day {day.day_number}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Insert day below day ${day.day_number}`}
              className={`${buttonClass} border-l`}
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onInsert(day.day_number + 1);
              }}
              type="button"
            >
              {insertIcon("down")}
              {mobile ? <span>Add day after</span> : null}
            </button>
          </TooltipTrigger>
          <TooltipContent>Insert a new day below Day {day.day_number}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Remove day ${day.day_number}`}
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
              {mobile ? <span>Remove day</span> : null}
            </button>
          </TooltipTrigger>
          <TooltipContent>Remove Day {day.day_number}</TooltipContent>
        </Tooltip>
      </div>
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Day {day.day_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This also deletes every itinerary item in this day. The remaining days and dates will
              be renumbered automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep day</AlertDialogCancel>
            <AlertDialogAction onClick={() => onRemove(day.id)}>Remove day</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
