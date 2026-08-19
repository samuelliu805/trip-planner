"use client";

import { PlannerContextBar } from "@/features/itinerary/components/planner-context-bar";
import { PlannerStatus } from "@/features/itinerary/components/planner-layout-elements";
import type { PlannerToolbarProps } from "@/features/itinerary/components/planner-toolbar-types";
import { TripAppBar } from "@/features/trips/components/trip-app-bar";

export function PlannerToolbar(props: PlannerToolbarProps) {
  return (
    <>
      <TripAppBar
        active="plan"
        mutating={props.mutating}
        onTripSettings={() => props.setSettingsOpen(true)}
        shareControls={props.shareControls}
        title={props.trip.title}
        tripId={props.trip.id}
        variantControls={props.variantControls}
        variantId={props.variantId}
      />
      <PlannerContextBar {...props} />
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
