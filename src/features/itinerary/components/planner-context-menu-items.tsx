"use client";

import { ClipboardPaste, Copy, ListOrdered, Plus, Trash2 } from "lucide-react";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { PlannerContextProps } from "@/features/itinerary/components/planner-context-bar";
import { PlannerResearchActions } from "@/features/research/components/planner-research-actions";

/** Table actions for the trip menu; the bar itself only keeps the contextual primary action. */
export function PlannerContextMenuItems(props: PlannerContextProps) {
  const showResearch = props.selectedCount === 1 && Boolean(props.researchContext);
  const researchSourceItem = props.researchContext?.itemId
    ? props.planDays
        .flatMap(({ items }) => items)
        .find(({ id }) => id === props.researchContext?.itemId)
    : undefined;
  return (
    <>
      {showResearch && props.researchContext ? (
        <>
          <div className="px-1 py-1">
            <PlannerResearchActions
              compact
              context={props.researchContext}
              currency={props.trip.currency}
              days={props.planDays}
              items={props.researchItems}
              sourceItem={researchSourceItem}
              tripId={props.trip.id}
            />
          </div>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuItem
        disabled={props.dayMutationPending}
        onSelect={() => void props.insertDay(props.workspaceDayCount + 1)}
      >
        <Plus className="size-4" /> Add day at end
      </DropdownMenuItem>
      {props.activeDay ? (
        <DropdownMenuItem onSelect={() => props.onArrangeActivities(props.activeDay!)}>
          <ListOrdered className="size-4" /> Arrange Activities
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={props.requestPending} onSelect={props.copySelectionToClipboard}>
        <Copy className="size-4" /> Copy selected cells
      </DropdownMenuItem>
      <DropdownMenuItem disabled={props.requestPending} onSelect={props.pasteAvailableClipboard}>
        <ClipboardPaste className="size-4" /> Paste
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!props.clearItemCount || props.clearPending}
        onSelect={props.requestClearSelection}
      >
        <Trash2 className="size-4" /> Clear selected cells
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={props.requestPending}
        onSelect={() => props.setCopyDaysOpen(true)}
      >
        Copy to days…
      </DropdownMenuItem>
      <DropdownMenuItem disabled={props.requestPending} onSelect={props.copyPreviousDay}>
        Copy previous day
      </DropdownMenuItem>
    </>
  );
}
