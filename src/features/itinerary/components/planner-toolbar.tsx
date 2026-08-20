"use client";

import { ArrowDown, ArrowUp, Copy } from "lucide-react";

import { PlannerContextActions } from "@/features/itinerary/components/planner-context-bar";
import {
  PlannerContextMenuItems,
  PlannerMobileMenuItems,
} from "@/features/itinerary/components/planner-context-menu-items";
import { PlannerStatus } from "@/features/itinerary/components/planner-layout-elements";
import type { PlannerToolbarProps } from "@/features/itinerary/components/planner-toolbar-types";
import { TripAppBar } from "@/features/trips/components/trip-app-bar";

export function PlannerToolbar(props: PlannerToolbarProps) {
  return (
    <>
      <TripAppBar
        accountEmail={props.accountEmail}
        actions={<PlannerContextActions {...props} />}
        active="plan"
        menuItems={<PlannerContextMenuItems {...props} />}
        mobileMenuItems={(runAction) => (
          <PlannerMobileMenuItems props={props} runAction={runAction} />
        )}
        mobileQuickActions={[
          {
            disabled: props.requestPending,
            icon: <Copy aria-hidden="true" className="size-5" />,
            id: "copy",
            label: "Copy",
            onSelect: () => void props.copySelectionToClipboard(),
          },
          {
            disabled: !props.activeDay || props.dayMutationPending,
            icon: <ArrowUp aria-hidden="true" className="size-5" />,
            id: "day-before",
            label: "Day before",
            onSelect: () => void (props.activeDay && props.insertDay(props.activeDay.day_number)),
          },
          {
            disabled: !props.activeDay || props.dayMutationPending,
            icon: <ArrowDown aria-hidden="true" className="size-5" />,
            id: "day-after",
            label: "Day after",
            onSelect: () =>
              void (props.activeDay && props.insertDay(props.activeDay.day_number + 1)),
          },
        ]}
        mutating={props.mutating}
        onTripSettings={() => props.setSettingsOpen(true)}
        shareControls={props.shareControls}
        title={props.trip.title}
        tripId={props.trip.id}
        variantControls={props.variantControls}
        variantId={props.variantId}
      />
      <PlannerStatus
        deleteError={props.deleteError}
        fillLabel={props.fillLabel}
        fillThroughDay={props.fillThroughDay}
        interactionError={props.interactionError}
        isEmpty={props.isEmpty}
        isFillDragging={props.isFillDragging}
        onDismissError={() => props.setInteractionError(undefined)}
        workspaceError={props.workspaceError}
      />
    </>
  );
}
