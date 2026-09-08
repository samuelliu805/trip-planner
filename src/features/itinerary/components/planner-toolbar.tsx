"use client";

import { Copy, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

import { InsertRowIcon } from "@/features/itinerary/components/insert-row-icon";
import { PlannerContextActions } from "@/features/itinerary/components/planner-context-bar";
import {
  PlannerContextMenuItems,
  PlannerMobileMenuItems,
} from "@/features/itinerary/components/planner-context-menu-items";
import { PlannerStatus } from "@/features/itinerary/components/planner-layout-elements";
import type { PlannerToolbarProps } from "@/features/itinerary/components/planner-toolbar-types";
import type { PlannerDay } from "@/features/itinerary/types";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { TripAppBar } from "@/features/trips/components/trip-app-bar";

export function PlannerToolbar(props: PlannerToolbarProps) {
  const { t } = useI18n();
  const [dayToRemove, setDayToRemove] = useState<PlannerDay | null>(null);
  const activeDay = props.activeDay;
  const queryClient = useQueryClient();

  async function reloadRemoveDayScope() {
    await props.onReloadLatest();
    if (!dayToRemove) return;
    const latest = queryClient.getQueryData<PlannerWorkspace>(
      plannerQueryKey(props.trip.id, props.variantId),
    );
    if (latest?.days.some(({ id }) => id === dayToRemove.id)) return;
    setDayToRemove(null);
    props.setInteractionError("That day was already removed. The latest Plan is now visible.");
  }

  return (
    <>
      <TripAppBar
        accountEmail={props.accountEmail}
        canDelete={props.trip.role === "owner"}
        actions={<PlannerContextActions {...props} />}
        active="plan"
        menuItems={
          <PlannerContextMenuItems
            {...props}
            onRequestRemoveDay={() => activeDay && setDayToRemove(activeDay)}
          />
        }
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
            icon: <InsertRowIcon className="size-5 shrink-0" direction="above" />,
            id: "day-before",
            label: "Add day before",
            onSelect: () => void (props.activeDay && props.insertDay(props.activeDay.day_number)),
          },
          {
            disabled: !props.activeDay || props.dayMutationPending,
            icon: <InsertRowIcon className="size-5 shrink-0" direction="below" />,
            id: "day-after",
            label: "Add day after",
            onSelect: () =>
              void (props.activeDay && props.insertDay(props.activeDay.day_number + 1)),
          },
          {
            disabled: !activeDay || props.workspaceDayCount <= 1 || props.dayMutationPending,
            icon: <Trash2 aria-hidden="true" className="size-5" />,
            id: "remove-day",
            label: activeDay
              ? t("Remove Day {day}", { day: activeDay.day_number })
              : t("Remove day"),
            onSelect: () => activeDay && setDayToRemove(activeDay),
            tone: "destructive",
          },
        ]}
        mutating={props.mutating}
        guestExperience={props.guestExperience}
        onTripSettings={() => props.setSettingsOpen(true)}
        shareControls={props.shareControls}
        title={props.trip.title}
        tripId={props.trip.id}
        tripContentVersion={props.trip.content_version}
        tripVersion={props.trip.version}
        variantControls={props.variantControls}
        variantId={props.variantId}
      />
      <PlannerStatus
        deleteError={props.deleteError}
        fillLabel={props.fillLabel}
        fillThroughDay={props.fillThroughDay}
        interactionError={props.interactionError}
        interactionConflict={props.interactionConflict}
        isFillDragging={props.isFillDragging}
        onDismissError={() => props.setInteractionError(undefined)}
        onReloadLatest={props.onReloadLatest}
        reloadPending={props.reloadPending}
        workspaceError={props.workspaceError}
      />
      <AlertDialog
        onOpenChange={(open) => !open && setDayToRemove(null)}
        open={Boolean(dayToRemove)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dayToRemove ? (
                <T message={"Remove Day {day}"} values={{ day: dayToRemove.day_number }} />
              ) : (
                <T message={"Remove day"} />
              )}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <T
                message={
                  " This also deletes every itinerary item in this day. The remaining days and dates will be renumbered automatically. "
                }
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          {props.interactionConflict ? (
            <Button
              className="mx-5 min-h-11 sm:mx-6"
              disabled={props.reloadPending}
              onClick={() => void reloadRemoveDayScope()}
              type="button"
              variant="outline"
            >
              <Localized value={props.reloadPending ? "Loading…" : "Reload latest"} />
            </Button>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>
              <T message={"Keep day"} />
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!dayToRemove || props.dayMutationPending}
              onClick={() => {
                if (dayToRemove) void props.removeDay(dayToRemove.id);
              }}
            >
              <T message={"Remove day"} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
