"use client";

import {
  ClipboardPaste,
  Copy,
  ListOrdered,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PlannerToolbarProps } from "@/features/itinerary/components/planner-toolbar-types";
import { PlanCostMenu } from "@/features/research/components/plan-cost-menu";
import { PlannerResearchActions } from "@/features/research/components/planner-research-actions";
import { formatMoney } from "@/features/research/money";
import { matchingPlanResearchItems } from "@/features/research/urls";

type PlannerContextBarProps = Pick<
  PlannerToolbarProps,
  | "activeCategory"
  | "activeCellAtCapacity"
  | "activeDay"
  | "clearItemCount"
  | "clearPending"
  | "copyPreviousDay"
  | "copySelectionToClipboard"
  | "dateRange"
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
  | "variantId"
  | "workspaceDayCount"
>;

export function PlannerContextBar(props: PlannerContextBarProps) {
  const oneCell = props.selectedCount === 1;
  const manyCells = props.selectedCount > 1;
  const canAdd =
    oneCell &&
    !props.selectedItem &&
    !props.activeCellAtCapacity &&
    props.activeCategory?.id !== "city";
  const mobileContextActive =
    manyCells ||
    (oneCell && (canAdd || Boolean(props.selectedItem) || Boolean(props.researchContext)));
  const contextLabel = manyCells
    ? `${props.selectedCount} cells selected`
    : oneCell && props.activeDay && props.activeCategory
      ? `${props.activeCategory.label} · Day ${props.activeDay.day_number} selected`
      : `Table · ${props.dateRange}`;
  const selectedIds = new Set(
    props.researchSelections.map((selection) => selection.research_item_id),
  );
  const selectedOption = props.researchContext
    ? matchingPlanResearchItems(props.researchItems, props.researchContext).find((item) =>
        selectedIds.has(item.id),
      )
    : undefined;
  const researchSourceItem = props.researchContext?.itemId
    ? props.planDays
        .flatMap(({ items }) => items)
        .find(({ id }) => id === props.researchContext?.itemId)
    : undefined;
  const selectedPrice =
    selectedOption?.total_price_amount !== null && selectedOption?.currency
      ? `${selectedOption.currency} ${formatMoney(
          selectedOption.total_price_amount,
          selectedOption.currency,
        )}`
      : null;

  function openEditor() {
    if (!props.activeDay || !props.activeCategory) return;
    props.setEditor({
      dayId: props.activeDay.id,
      item: props.selectedItem,
      type: props.selectedItem?.type ?? props.activeCategory.defaultType,
    });
  }

  return (
    <div
      aria-label="Plan context"
      className={`plan-context-bar z-[70] flex min-h-14 min-w-0 shrink-0 items-center border-b bg-background/95 backdrop-blur ${mobileContextActive ? "" : "is-idle"}`}
    >
      <div className="flex min-h-14 w-full min-w-0 items-center gap-2 px-4 md:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{contextLabel}</p>
          {selectedOption ? (
            <p className="truncate text-xs font-medium text-primary">
              Selected option · {selectedOption.title ?? "Saved choice"}
              {selectedPrice ? <span className="lg:hidden"> · {selectedPrice}</span> : null}
            </p>
          ) : oneCell && props.researchContext ? (
            <p className="truncate text-xs text-muted-foreground">Compare saved options</p>
          ) : null}
        </div>

        <PlanCostMenu lines={props.planCostLines} summary={props.planCostSummary} />
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
          {oneCell && (canAdd || props.selectedItem) ? (
            <Button className="h-11 px-3" onClick={openEditor} size="sm">
              {props.selectedItem ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              <span className="hidden min-[430px]:inline">
                {props.selectedItem ? "Edit" : "Add"}
              </span>
            </Button>
          ) : null}
          {oneCell && props.researchContext ? (
            <div className="hidden min-w-0 md:block">
              <PlannerResearchActions
                context={props.researchContext}
                currency={props.trip.currency}
                days={props.planDays}
                items={props.researchItems}
                sourceItem={researchSourceItem}
                tripId={props.trip.id}
              />
            </div>
          ) : null}
          {manyCells ? (
            <>
              <Button
                aria-busy={props.requestPending}
                className="h-11 px-3"
                disabled={props.requestPending}
                onClick={props.copySelectionToClipboard}
                size="sm"
                variant="outline"
              >
                {props.requestPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Copy className="size-4" />
                )}
                <span className="hidden min-[430px]:inline">Copy</span>
              </Button>
              <Button
                className="h-11 px-3"
                disabled={!props.clearItemCount || props.clearPending}
                onClick={props.requestClearSelection}
                size="sm"
                variant="outline"
              >
                <Trash2 className="size-4" />
                <span className="hidden min-[430px]:inline">Clear</span>
              </Button>
            </>
          ) : null}
          {!oneCell && !manyCells ? (
            <Button
              className="hidden h-11 px-3 sm:inline-flex"
              disabled={props.dayMutationPending}
              onClick={() => void props.insertDay(props.workspaceDayCount + 1)}
              size="sm"
              variant="outline"
            >
              <Plus className="size-4" /> Add day
            </Button>
          ) : null}
          <ContextOverflow {...props} showResearch={oneCell && Boolean(props.researchContext)} />
        </div>
      </div>
    </div>
  );
}

function ContextOverflow(props: PlannerContextBarProps & { showResearch: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="More context actions" className="size-11 p-0" variant="outline">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {props.showResearch && props.researchContext ? (
          <div className="px-1 py-1 md:hidden">
            <PlannerResearchActions
              compact
              context={props.researchContext}
              currency={props.trip.currency}
              days={props.planDays}
              items={props.researchItems}
              sourceItem={
                props.researchContext.itemId
                  ? props.planDays
                      .flatMap(({ items }) => items)
                      .find(({ id }) => id === props.researchContext?.itemId)
                  : undefined
              }
              tripId={props.trip.id}
            />
          </div>
        ) : null}
        {props.showResearch ? <DropdownMenuSeparator className="md:hidden" /> : null}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
