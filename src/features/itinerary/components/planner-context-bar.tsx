"use client";

import { Copy, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlannerToolbarProps } from "@/features/itinerary/components/planner-toolbar-types";
import { PlanCostMenu } from "@/features/research/components/plan-cost-menu";

export type PlannerContextProps = Pick<
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
  | "planCostLines"
  | "planCostSummary"
  | "planDays"
  | "requestClearSelection"
  | "requestPending"
  | "researchContext"
  | "researchItems"
  | "researchSelections"
  | "selectedCount"
  | "selectedItem"
  | "setCopyDaysOpen"
  | "setEditor"
  | "trip"
  | "workspaceDayCount"
>;

/**
 * The working controls that sit inside the one app bar: cost, the contextual Add or Edit action,
 * and the selection actions. Everything rarer lives in the trip menu next to them.
 */
export function PlannerContextActions(props: PlannerContextProps) {
  const oneCell = props.selectedCount === 1;
  const manyCells = props.selectedCount > 1;
  const canAdd =
    oneCell &&
    !props.selectedItem &&
    !props.activeCellAtCapacity &&
    props.activeCategory?.id !== "city";

  function openEditor() {
    if (!props.activeDay || !props.activeCategory) return;
    props.setEditor({
      dayId: props.activeDay.id,
      item: props.selectedItem,
      type: props.selectedItem?.type ?? props.activeCategory.defaultType,
    });
  }

  return (
    <>
      <PlanCostMenu lines={props.planCostLines} summary={props.planCostSummary} />
      {manyCells ? (
        <>
          <Button
            aria-busy={props.requestPending}
            aria-label="Copy selected cells"
            className="h-11 px-2.5"
            disabled={props.requestPending}
            onClick={props.copySelectionToClipboard}
            size="sm"
            variant="ghost"
          >
            {props.requestPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Copy className="size-4" />
            )}
            <span className="hidden sm:inline">Copy</span>
          </Button>
          <Button
            aria-label="Clear selected cells"
            className="h-11 px-2.5"
            disabled={!props.clearItemCount || props.clearPending}
            onClick={props.requestClearSelection}
            size="sm"
            variant="ghost"
          >
            <Trash2 className="size-4" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        </>
      ) : null}
      {oneCell && (canAdd || props.selectedItem) ? (
        <Button className="h-11 px-3" onClick={openEditor} size="sm">
          {props.selectedItem ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          <span className="hidden min-[430px]:inline">{props.selectedItem ? "Edit" : "Add"}</span>
        </Button>
      ) : null}
    </>
  );
}
