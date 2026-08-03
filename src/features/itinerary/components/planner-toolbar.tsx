"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  MoreHorizontal,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
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
  interactionError,
  isEmpty,
  isFillDragging,
  mutating,
  pasteAvailableClipboard,
  requestClearSelection,
  removeDay,
  selectedCount,
  selectedDay,
  setCopyDaysOpen,
  setEditor,
  setInteractionError,
  setSettingsOpen,
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
  interactionError?: string;
  isEmpty: boolean;
  isFillDragging: boolean;
  mutating: boolean;
  pasteAvailableClipboard: () => Promise<void>;
  requestClearSelection: () => void;
  removeDay: (dayId: string) => Promise<void>;
  selectedCount: number;
  selectedDay: PlannerDay | null;
  setCopyDaysOpen: Dispatch<SetStateAction<boolean>>;
  setEditor: Dispatch<SetStateAction<EditorState | null>>;
  setInteractionError: Dispatch<SetStateAction<string | undefined>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  trip: Tables<"trips">;
  workspaceError: boolean;
  workspaceDayCount: number;
  variantControls: ReactNode;
}) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 sm:px-4 xl:h-[72px] xl:gap-4 xl:px-5">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2 xl:gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild className="size-11 p-0 xl:size-9" variant="ghost">
                <Link aria-label="Back to Trips" href="/trips">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to Trips</TooltipContent>
          </Tooltip>
          <div className="hidden min-w-0 sm:block">
            <h1 className="max-w-[180px] truncate text-base font-semibold sm:max-w-[260px] xl:max-w-none xl:text-lg">
              {trip.title}
            </h1>
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
              <DropdownMenuItem className="xl:hidden" onSelect={copySelectionToClipboard}>
                <Copy className="size-4" />
                Copy selected cells
              </DropdownMenuItem>
              <DropdownMenuItem className="xl:hidden" onSelect={pasteAvailableClipboard}>
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
              <DropdownMenuItem className="xl:hidden" onSelect={() => setCopyDaysOpen(true)}>
                Copy to days…
              </DropdownMenuItem>
              <DropdownMenuItem className="xl:hidden" onSelect={copyPreviousDay}>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings2 className="size-4" />
                Trip settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {selectedDay ? (
        <div className="shrink-0 border-b bg-muted/20 px-3 py-2 sm:hidden">
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            Day {selectedDay.day_number} row actions
          </div>
          <DayActions
            day={selectedDay}
            isOnlyDay={workspaceDayCount === 1}
            location="mobilebar"
            onInsert={(position) => void insertDay(position)}
            onRemove={(dayId) => void removeDay(dayId)}
            pending={dayMutationPending}
            visible
          />
        </div>
      ) : null}
      <div className="hidden h-10 shrink-0 items-center justify-between gap-3 border-b bg-muted/20 px-3 xl:flex">
        <div className="flex items-center gap-1 whitespace-nowrap">
          {selectedCount === 1 && !activeCellAtCapacity ? (
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
            onClick={copySelectionToClipboard}
            size="sm"
            variant="ghost"
          >
            <Copy className="size-3.5" />
            Copy
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
              <DropdownMenuItem onSelect={() => setCopyDaysOpen(true)}>
                Copy to days…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={copyPreviousDay}>Copy previous day</DropdownMenuItem>
              <DropdownMenuItem onSelect={pasteAvailableClipboard}>
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
