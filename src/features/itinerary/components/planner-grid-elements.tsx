"use client";

import { Plus, Trash2 } from "lucide-react";
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
          className="mt-auto flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded border border-dashed bg-background text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          data-add-item
          disabled={disabled}
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
      <TooltipContent>
        {disabled
          ? "Only one hotel is allowed per day"
          : `Add another ${category.label.toLowerCase()}`}
      </TooltipContent>
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
  onInsert,
  onRemove,
  pending,
  visible,
}: {
  day: PlannerDay;
  isOnlyDay: boolean;
  location: "cell" | "mobilebar";
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
  return (
    <>
      <div
        className={
          mobile
            ? "grid w-full grid-cols-2 gap-2"
            : "mt-2 hidden grid-cols-3 overflow-hidden rounded-md border bg-background shadow-sm sm:grid"
        }
      >
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
              className={`${buttonClass} ${!mobile ? "border-l" : ""}`}
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
