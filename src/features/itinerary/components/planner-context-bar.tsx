"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { Copy, LoaderCircle, Map, Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { PlannerToolbarProps } from "@/features/itinerary/components/planner-toolbar-types";
import { PlanCostMenu } from "@/features/research/components/plan-cost-menu";
import { researchCategoryHref } from "@/features/research/urls";

export type PlannerContextProps = Pick<
  PlannerToolbarProps,
  | "activeCategory"
  | "activeCellAtCapacity"
  | "activeDay"
  | "guestExperience"
  | "clearItemCount"
  | "clearPending"
  | "copyPreviousDay"
  | "copySelectionToClipboard"
  | "dayMutationPending"
  | "insertDay"
  | "onMapExpand"
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
  | "variantId"
  | "workspaceDayCount"
>;

/**
 * The app bar keeps only the contextual Add/Edit or one selection action. Cost stays mounted here
 * as a pull-up host but opens from the trip menu, where the remaining table actions also live.
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
      {!props.guestExperience ? (
        <Button
          asChild
          aria-label="Add idea"
          className="size-11 shrink-0 p-0 min-[900px]:h-11 min-[900px]:w-auto min-[900px]:px-3"
          size="sm"
          variant="outline"
        >
          <Link
            href={researchCategoryHref(props.trip.id, "flight", {
              variantId: props.variantId,
              newIdea: true,
            })}
          >
            <Plus aria-hidden="true" className="size-4" />
            <span className="hidden min-[900px]:inline">
              <T message="Add idea" />
            </span>
          </Link>
        </Button>
      ) : null}
      <Button
        aria-label="Open map and route tools"
        className="size-11 shrink-0 p-0 min-[900px]:hidden"
        data-i18n-aria-label="Open map and route tools"
        onClick={props.onMapExpand}
        type="button"
      >
        <Map aria-hidden="true" className="size-4" />
      </Button>
      {manyCells ? (
        <Button
          aria-busy={props.requestPending}
          aria-label="Copy selected cells"
          data-i18n-aria-label={"Copy selected cells"}
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
          <span className="hidden sm:inline">
            <T message={"Copy"} />
          </span>
        </Button>
      ) : null}
      {oneCell && (canAdd || props.selectedItem) ? (
        <Button className="hidden h-11 px-3 min-[900px]:inline-flex" onClick={openEditor} size="sm">
          {props.selectedItem ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          <span className="hidden min-[430px]:inline">
            <Localized value={props.selectedItem ? "Edit" : "Add"} />
          </span>
        </Button>
      ) : null}
    </>
  );
}
