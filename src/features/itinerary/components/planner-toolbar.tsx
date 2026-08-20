"use client";

import { PlannerContextActions } from "@/features/itinerary/components/planner-context-bar";
import { PlannerContextMenuItems } from "@/features/itinerary/components/planner-context-menu-items";
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
