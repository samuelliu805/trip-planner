"use client";

import { ClipboardPaste, Copy, ListOrdered, Plus, ReceiptText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { PlannerContextProps } from "@/features/itinerary/components/planner-context-bar";
import { PlannerResearchActions } from "@/features/research/components/planner-research-actions";
import { OPEN_PLAN_COST_EVENT } from "@/features/research/events";

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
      <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(OPEN_PLAN_COST_EVENT))}>
        <ReceiptText className="size-4" /> Plan cost
      </DropdownMenuItem>
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

export function PlannerMobileMenuItems({
  props,
  runAction,
}: {
  props: PlannerContextProps;
  runAction: (action: () => void) => void;
}) {
  const showResearch = props.selectedCount === 1 && Boolean(props.researchContext);
  const researchSourceItem = props.researchContext?.itemId
    ? props.planDays
        .flatMap(({ items }) => items)
        .find(({ id }) => id === props.researchContext?.itemId)
    : undefined;
  const rowClass = "min-h-11 w-full justify-start px-3 font-normal";

  return (
    <div className="space-y-1">
      <Button
        className={rowClass}
        onClick={() => runAction(() => window.dispatchEvent(new Event(OPEN_PLAN_COST_EVENT)))}
        variant="ghost"
      >
        <ReceiptText className="size-4" /> Plan cost
      </Button>
      {showResearch && props.researchContext ? (
        <div className="pb-2">
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
      ) : null}
      {props.activeDay ? (
        <Button
          className={rowClass}
          onClick={() => runAction(() => props.onArrangeActivities(props.activeDay!))}
          variant="ghost"
        >
          <ListOrdered className="size-4" /> Arrange Activities
        </Button>
      ) : null}
      <Button
        className={rowClass}
        disabled={props.dayMutationPending}
        onClick={() =>
          runAction(() => {
            void props.insertDay(props.workspaceDayCount + 1);
          })
        }
        variant="ghost"
      >
        <Plus className="size-4" /> Add day at end
      </Button>
      <Button
        className={rowClass}
        disabled={props.requestPending}
        onClick={() =>
          runAction(() => {
            void props.pasteAvailableClipboard();
          })
        }
        variant="ghost"
      >
        <ClipboardPaste className="size-4" /> Paste
      </Button>
      <Button
        className={rowClass}
        disabled={!props.clearItemCount || props.clearPending}
        onClick={() => runAction(props.requestClearSelection)}
        variant="ghost"
      >
        <Trash2 className="size-4" /> Clear selected cells
      </Button>
      <Button
        className={rowClass}
        disabled={props.requestPending}
        onClick={() => runAction(() => props.setCopyDaysOpen(true))}
        variant="ghost"
      >
        <Copy className="size-4" /> Copy to days…
      </Button>
      <Button
        className={rowClass}
        disabled={props.requestPending}
        onClick={() =>
          runAction(() => {
            void props.copyPreviousDay();
          })
        }
        variant="ghost"
      >
        <Copy className="size-4" /> Copy previous day
      </Button>
    </div>
  );
}
