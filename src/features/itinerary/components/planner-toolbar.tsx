"use client";

import {
  ArrowLeft,
  CalendarDays,
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
import { PlannerEditingToolbar } from "@/features/itinerary/components/planner-editing-toolbar";
import { PlannerStatus } from "@/features/itinerary/components/planner-layout-elements";
import { PlannerSaveStatus } from "@/features/itinerary/components/planner-save-status";
import type { PlannerToolbarProps } from "@/features/itinerary/components/planner-toolbar-types";
import { PlannerResearchActions } from "@/features/research/components/planner-research-actions";

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
  researchContext,
  researchItems,
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
}: PlannerToolbarProps) {
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
          <PlannerSaveStatus mutating={mutating} />
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
      <PlannerEditingToolbar
        activeCategory={activeCategory}
        activeCellAtCapacity={activeCellAtCapacity}
        activeDay={activeDay}
        clearItemCount={clearItemCount}
        clearPending={clearPending}
        copyPreviousDay={copyPreviousDay}
        copySelectionToClipboard={copySelectionToClipboard}
        dayMutationPending={dayMutationPending}
        insertDay={insertDay}
        onArrangeActivities={onArrangeActivities}
        pasteAvailableClipboard={pasteAvailableClipboard}
        requestClearSelection={requestClearSelection}
        requestPending={requestPending}
        researchContext={researchContext}
        researchItems={researchItems}
        selectedCount={selectedCount}
        setCopyDaysOpen={setCopyDaysOpen}
        setEditor={setEditor}
        trip={trip}
        workspaceDayCount={workspaceDayCount}
      />
      {researchContext ? (
        <div className="flex min-h-11 shrink-0 items-center border-b bg-muted/20 px-2 xl:hidden">
          <PlannerResearchActions
            compact
            context={researchContext}
            currency={trip.currency}
            items={researchItems}
            tripId={trip.id}
          />
        </div>
      ) : null}
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
