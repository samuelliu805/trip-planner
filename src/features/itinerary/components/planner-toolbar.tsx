"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  MoreHorizontal,
  ListOrdered,
  LoaderCircle,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DayActions } from "@/features/itinerary/components/planner-grid-elements";
import { PlannerStatus } from "@/features/itinerary/components/planner-layout-elements";
import type { EditorState, PlannerCategory } from "@/features/itinerary/components/planner-config";
import type { PlannerDay } from "@/features/itinerary/types";
import type { Tables } from "@/types/database";

export function PlannerToolbar({
  activeCategory,
  activeCellAtCapacity,
  activeDay,
  copyPreviousDay,
  copySelectionToClipboard,
  clearItemCount,
  clearPending,
  dateRange,
  dayMutationPending,
  deleteError,
  fillLabel,
  fillThroughDay,
  insertDay,
  onArrangeActivities,
  interactionError,
  isEmpty,
  isFillDragging,
  mutating,
  pasteAvailableClipboard,
  requestPending,
  requestClearSelection,
  removeDay,
  selectedCount,
  selectedDay,
  setCopyDaysOpen,
  setEditor,
  setInteractionError,
  setSettingsOpen,
  shareControls,
  trip,
  workspaceError,
  workspaceDayCount,
  variantControls,
}: {
  activeCategory?: PlannerCategory;
  activeCellAtCapacity: boolean;
  activeDay?: PlannerDay;
  copyPreviousDay: () => Promise<void>;
  copySelectionToClipboard: () => Promise<void>;
  clearItemCount: number;
  clearPending: boolean;
  dateRange: string;
  dayMutationPending: boolean;
  deleteError: boolean;
  fillLabel: string;
  fillThroughDay?: number;
  insertDay: (position: number) => Promise<void>;
  onArrangeActivities: (day: PlannerDay) => void;
  interactionError?: string;
  isEmpty: boolean;
  isFillDragging: boolean;
  mutating: boolean;
  pasteAvailableClipboard: () => Promise<void>;
  requestPending: boolean;
  requestClearSelection: () => void;
  removeDay: (dayId: string) => Promise<void>;
  selectedCount: number;
  selectedDay: PlannerDay | null;
  setCopyDaysOpen: Dispatch<SetStateAction<boolean>>;
  setEditor: Dispatch<SetStateAction<EditorState | null>>;
  setInteractionError: Dispatch<SetStateAction<string | undefined>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  shareControls?: ReactNode;
  trip: Tables<"trips">;
  workspaceError: boolean;
  workspaceDayCount: number;
  variantControls: ReactNode;
}) {
  return (
    <>
      <header className="planner-toolbar sticky top-0 z-[70] flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-2 backdrop-blur sm:px-4 xl:h-[72px] xl:gap-4 xl:px-5">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2 xl:gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                className="hidden size-11 p-0 sm:inline-flex xl:size-9"
                variant="ghost"
              >
                <Link aria-label="Back to Trips" href="/trips">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to Trips</TooltipContent>
          </Tooltip>
          <div className="min-w-0">
            <h1 className="max-w-[88px] truncate text-sm font-semibold sm:max-w-[260px] sm:text-base xl:max-w-none xl:text-lg">
              {trip.title}
            </h1>
            <p className="mt-0.5 max-w-[104px] truncate text-[10px] leading-none text-muted-foreground sm:hidden">
              {selectedDay
                ? `Day ${selectedDay.day_number} · ${
                    selectedDay.date ? format(parseISO(selectedDay.date), "MMM d") : "Date TBD"
                  }`
                : "Tap a date to select a day"}
            </p>
            <p className="mt-0.5 hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
              <CalendarDays className="size-3.5" />
              {dateRange}
            </p>
          </div>
          {variantControls}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground sm:gap-2">
          <span
            className="hidden items-center gap-1.5 whitespace-nowrap sm:flex"
            aria-live="polite"
          >
            {mutating ? (
              <span className="size-2 animate-pulse rounded-full bg-amber-500" />
            ) : (
              <Check className="size-3.5 text-primary" />
            )}
            <span>{mutating ? "Saving…" : "Saved"}</span>
          </span>
          {selectedDay ? (
            <div className="sm:hidden">
              <DayActions
                day={selectedDay}
                isOnlyDay={workspaceDayCount === 1}
                location="mobilebar"
                onArrange={onArrangeActivities}
                onInsert={(position) => void insertDay(position)}
                onRemove={(dayId) => void removeDay(dayId)}
                pending={dayMutationPending}
                visible
              />
            </div>
          ) : null}
          {shareControls}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More trip actions"
                className="size-11 p-0 xl:size-9"
                variant="outline"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="xl:hidden"
                disabled={requestPending}
                onSelect={copySelectionToClipboard}
              >
                {requestPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Copy className="size-4" />
                )}
                Copy selected cells
              </DropdownMenuItem>
              <DropdownMenuItem
                className="xl:hidden"
                disabled={requestPending}
                onSelect={pasteAvailableClipboard}
              >
                <ClipboardPaste className="size-4" />
                Paste
              </DropdownMenuItem>
              <DropdownMenuItem
                className="xl:hidden"
                disabled={!clearItemCount || clearPending}
                onSelect={requestClearSelection}
              >
                <Trash2 className="size-4" />
                Clear selected cells
              </DropdownMenuItem>
              <DropdownMenuItem
                className="xl:hidden"
                disabled={requestPending}
                onSelect={() => setCopyDaysOpen(true)}
              >
                Copy to days…
              </DropdownMenuItem>
              <DropdownMenuItem
                className="xl:hidden"
                disabled={requestPending}
                onSelect={copyPreviousDay}
              >
                Copy previous day
              </DropdownMenuItem>
              <DropdownMenuSeparator className="xl:hidden" />
              <DropdownMenuItem
                disabled={dayMutationPending}
                onSelect={() => void insertDay(workspaceDayCount + 1)}
              >
                <Plus className="size-4" />
                Add day at end
              </DropdownMenuItem>
              {activeDay ? (
                <DropdownMenuItem onSelect={() => onArrangeActivities(activeDay)}>
                  <ListOrdered className="size-4" />
                  Arrange Activities
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings2 className="size-4" />
                Trip settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="hidden h-10 shrink-0 items-center justify-between gap-3 border-b bg-muted/20 px-3 xl:flex">
        <div className="flex items-center gap-1 whitespace-nowrap">
          {selectedCount === 1 && !activeCellAtCapacity && activeCategory?.id !== "city" ? (
            <Button
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                if (activeDay && activeCategory)
                  setEditor({ dayId: activeDay.id, type: activeCategory.defaultType });
              }}
              size="sm"
            >
              <Plus className="size-3.5" />
              Add item
            </Button>
          ) : null}
          <Button
            className="h-7 px-2 text-xs"
            disabled={dayMutationPending}
            onClick={() => void insertDay(workspaceDayCount + 1)}
            size="sm"
            variant="ghost"
          >
            <Plus className="size-3.5" />
            Add day
          </Button>
          <Button
            className="h-7 px-2 text-xs"
            disabled={!activeDay}
            onClick={() => activeDay && onArrangeActivities(activeDay)}
            size="sm"
            variant="ghost"
          >
            <ListOrdered className="size-3.5" />
            Arrange Activities
          </Button>
          <Button
            aria-busy={requestPending}
            className="h-7 px-2 text-xs"
            disabled={requestPending}
            onClick={copySelectionToClipboard}
            size="sm"
            variant="ghost"
          >
            {requestPending ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {requestPending ? "Working…" : "Copy"}
          </Button>
          <Button
            className="h-7 px-2 text-xs"
            disabled={!clearItemCount || clearPending}
            onClick={requestClearSelection}
            size="sm"
            variant="ghost"
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More editing actions"
                className="size-7 p-0"
                size="sm"
                variant="ghost"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled={requestPending} onSelect={() => setCopyDaysOpen(true)}>
                Copy to days…
              </DropdownMenuItem>
              <DropdownMenuItem disabled={requestPending} onSelect={copyPreviousDay}>
                Copy previous day
              </DropdownMenuItem>
              <DropdownMenuItem disabled={requestPending} onSelect={pasteAvailableClipboard}>
                <ClipboardPaste className="size-4" />
                Paste
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          Selected: {selectedCount} {selectedCount === 1 ? "cell" : "cells"}
        </span>
      </div>
      <PlannerStatus
        deleteError={deleteError}
        fillLabel={fillLabel}
        fillThroughDay={fillThroughDay}
        interactionError={interactionError}
        isEmpty={isEmpty}
        isFillDragging={isFillDragging}
        onDismissError={() => setInteractionError(undefined)}
        workspaceError={workspaceError}
      />
    </>
  );
}
