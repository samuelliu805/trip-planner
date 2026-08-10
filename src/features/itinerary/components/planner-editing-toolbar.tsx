"use client";

import {
  ChevronDown,
  ClipboardPaste,
  Copy,
  ListOrdered,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PlannerToolbarProps } from "@/features/itinerary/components/planner-toolbar-types";
import { PlannerResearchActions } from "@/features/research/components/planner-research-actions";

type PlannerEditingToolbarProps = Pick<
  PlannerToolbarProps,
  | "activeCategory"
  | "activeCellAtCapacity"
  | "activeDay"
  | "clearItemCount"
  | "clearPending"
  | "copyPreviousDay"
  | "copySelectionToClipboard"
  | "dayMutationPending"
  | "insertDay"
  | "onArrangeActivities"
  | "pasteAvailableClipboard"
  | "requestClearSelection"
  | "requestPending"
  | "researchContext"
  | "researchItems"
  | "selectedCount"
  | "setCopyDaysOpen"
  | "setEditor"
  | "trip"
  | "workspaceDayCount"
>;

export function PlannerEditingToolbar({
  activeCategory,
  activeCellAtCapacity,
  activeDay,
  clearItemCount,
  clearPending,
  copyPreviousDay,
  copySelectionToClipboard,
  dayMutationPending,
  insertDay,
  onArrangeActivities,
  pasteAvailableClipboard,
  requestClearSelection,
  requestPending,
  researchContext,
  researchItems,
  selectedCount,
  setCopyDaysOpen,
  setEditor,
  trip,
  workspaceDayCount,
}: PlannerEditingToolbarProps) {
  return (
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
        {researchContext ? (
          <PlannerResearchActions
            context={researchContext}
            currency={trip.currency}
            items={researchItems}
            tripId={trip.id}
          />
        ) : null}
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
  );
}
